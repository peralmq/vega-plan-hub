// p4-03 step 2 + Verification: the conversation state machine, and the
// Script 5 fixture replay (tap + free text mixed) against a mocked Bot API.
// The machine is stateless — every step re-derives from the store, so the
// replay below also proves a restart mid-conversation changes nothing.

import { describe, expect, it } from "vitest";
import {
  PLAN_CALLBACK_PREFIX,
  cookModeBaseUrl,
  encodePlanCallback,
  findOverlappingBatch,
  formatRange,
  handlePlanEvent,
  nextBatchRange,
  parsePlanCallback,
  planEventFromParse,
  renderDraft,
  type PlanButton,
  type PlanEvent,
  type PlanStore,
} from "./planConversation";
import { parseRecipeMarkdown, type ParsedRecipe } from "./recipeMarkdown";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  reconcileShoppingItems,
  type ExistingItemRow,
  type GeneratedShoppingItem,
} from "./planShopping";

// The real corpus, read through the SHARED parser exactly the way the bot
// does (p4-03 Decision Log: shared loader, no build-time mirror).
const RECIPES: ParsedRecipe[] = readdirSync(join(process.cwd(), "src/data/recipes"))
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .sort()
  .map((f) =>
    parseRecipeMarkdown(readFileSync(join(process.cwd(), "src/data/recipes", f), "utf8"), f),
  )
  .filter((r): r is ParsedRecipe => r !== null);

interface PoolRowRecord {
  id: string;
  recipe_id: string;
  servings_multiplier: number;
  batch_id: string | null;
}

// In-memory PlanStore: the same seam bot/planning.ts implements over
// Supabase. Nothing here knows about Telegram or Postgres.
function makeStore(seed: { batches?: Array<{ id: string; starts_on: string; ends_on: string }> } = {}) {
  let nextId = 1;
  const pool: PoolRowRecord[] = [];
  const batches = seed.batches ? [...seed.batches] : [];
  const items = new Map<string, ExistingItemRow[]>();

  const store: PlanStore & { pool: PoolRowRecord[]; batches: typeof batches; items: typeof items } = {
    pool,
    batches,
    items,
    recipes: () => RECIPES,
    ratings: async () => new Map(),
    lastCooked: async () => new Map(),
    preferences: async () => new Map(),
    loadDraft: async () => pool.filter((r) => r.batch_id === null),
    loadCurrentBatch: async (todayIso: string) => {
      const batch = batches.find((b) => b.starts_on <= todayIso && todayIso <= b.ends_on);
      if (!batch) return null;
      return { batch, entries: pool.filter((r) => r.batch_id === batch.id) };
    },
    loadLockedBatches: async () => batches,
    replaceDraft: async (entries) => {
      for (let i = pool.length - 1; i >= 0; i--) if (pool[i].batch_id === null) pool.splice(i, 1);
      for (const e of entries) {
        pool.push({
          id: `pm-${nextId++}`,
          recipe_id: e.recipeId,
          servings_multiplier: e.servingsMultiplier,
          batch_id: null,
        });
      }
    },
    updateEntry: async (id, patch) => {
      const row = pool.find((r) => r.id === id)!;
      if (patch.recipe_id != null) row.recipe_id = patch.recipe_id;
      if (patch.servings_multiplier != null) row.servings_multiplier = patch.servings_multiplier;
    },
    deleteEntry: async (id) => {
      pool.splice(pool.findIndex((r) => r.id === id), 1);
    },
    lockBatch: async (range, entryIds, generated) => {
      const id = `batch-${batches.length + 1}`;
      batches.push({ id, starts_on: range.startsOn, ends_on: range.endsOn });
      for (const row of pool) if (entryIds.includes(row.id)) row.batch_id = id;
      items.set(
        id,
        generated.map((item: GeneratedShoppingItem, i: number) => ({
          id: `sli-${id}-${i}`,
          canonical_ingredient: item.canonicalIngredient,
          display_name: item.displayName,
          quantity: item.quantity,
          unit: item.unit,
          checked_at: null,
        })),
      );
      return id;
    },
    loadBatchItems: async (batchId) => items.get(batchId) ?? [],
    applyItemPlan: async (batchId, plan) => {
      const rows = items.get(batchId) ?? [];
      const kept = rows.filter((r) => !plan.deleteIds.includes(r.id));
      for (const update of plan.updates) {
        const row = kept.find((r) => r.id === update.id);
        if (row) {
          row.quantity = update.item.quantity;
          row.display_name = update.item.displayName;
        }
      }
      let n = kept.length;
      for (const item of plan.inserts) {
        kept.push({
          id: `sli-${batchId}-n${n++}`,
          canonical_ingredient: item.canonicalIngredient,
          display_name: item.displayName,
          quantity: item.quantity,
          unit: item.unit,
          checked_at: null,
        });
      }
      items.set(batchId, kept);
    },
    estimateSek: async (names) => names.length * 25,
  };
  return store;
}

// The mocked Bot API: records every outbound call so the replay can assert
// that a multi-step flow EDITS ONE MESSAGE instead of stacking new ones
// (design.spec "Chat voice").
function makeChat() {
  const sent: Array<{ text: string; buttons: string[] }> = [];
  const edits: Array<{ messageId: number; text: string; buttons: string[] }> = [];
  const calls: Array<{ messageId?: number; text: string; buttons: string[] }> = [];
  const labels = (buttons?: Array<Array<{ text: string; callback_data?: string; url?: string }>>) =>
    (buttons ?? []).flat().map((b) => b.callback_data ?? b.url ?? b.text);
  return {
    sent,
    edits,
    last: () => calls[calls.length - 1],
    calls,
    chat: {
      send: async (text: string, buttons?: Parameters<typeof labels>[0]) => {
        const call = { text, buttons: labels(buttons) };
        sent.push(call);
        calls.push(call);
        return 100 + sent.length;
      },
      edit: async (messageId: number, text: string, buttons?: Parameters<typeof labels>[0]) => {
        const call = { messageId, text, buttons: labels(buttons) };
        edits.push(call);
        calls.push(call);
      },
    },
  };
}

const titleFor = (recipeId: string): string =>
  RECIPES.find((r) => r.id === recipeId)?.title ?? recipeId;

const ctx = (over: Partial<{ messageId: number }> = {}) => ({
  lang: "sv" as const,
  todayIso: "2026-08-27",
  familyMemberId: "fm-1",
  session: {} as { pendingDiff?: { added: string[] } },
  ...over,
});

describe("callback vocabulary", () => {
  const roundTrip: PlanEvent[] = [
    { kind: "draft", horizonDays: 5 },
    { kind: "reroll" },
    { kind: "edit_menu" },
    { kind: "pick_entry", index: 3 },
    { kind: "swap", index: 3, recipeId: "saffron-scented-lentil-stew-with-potatoes" },
    { kind: "multiplier", index: 2, multiplier: 2 },
    { kind: "remove", index: 1 },
    { kind: "lock" },
    { kind: "show_list" },
    { kind: "diff", accepted: true },
    { kind: "diff", accepted: false },
    { kind: "cancel" },
  ];

  it("round-trips every event and fits Telegram's 64-byte callback_data", () => {
    for (const event of roundTrip) {
      const data = encodePlanCallback(event);
      expect(data.startsWith(PLAN_CALLBACK_PREFIX)).toBe(true);
      expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
      expect(parsePlanCallback(data)).toEqual(event);
    }
  });

  it("ignores callbacks that are not ours", () => {
    expect(parsePlanCallback("note_yes")).toBeNull();
    expect(parsePlanCallback("p:nonsense")).toBeNull();
    expect(parsePlanCallback("p:h:abc")).toBeNull();
  });
});

describe("intent → event (pool reinterpretation of the p4-02 slots)", () => {
  it("asks for a horizon when none was stated, drafts when one was", () => {
    expect(planEventFromParse({ intent: "plan_draft" }, "2026-08-27")).toEqual({ kind: "start" });
    expect(planEventFromParse({ intent: "plan_draft", horizon: "sunday" }, "2026-08-27")).toEqual({
      kind: "draft",
      horizonDays: 3,
    });
  });

  it("reads a numeric horizon (the rules layer's pool-shaped slot)", () => {
    expect(planEventFromParse({ intent: "plan_draft", horizon: "5" }, "2026-08-27")).toEqual({
      kind: "draft",
      horizonDays: 5,
    });
    expect(planEventFromParse({ intent: "plan_draft", horizon: "99" }, "2026-08-27")).toEqual({
      kind: "draft",
      horizonDays: 14,
    });
  });

  it("reads plan_set_day as a POOL swap — the weekday is not a slot any more", () => {
    expect(
      planEventFromParse(
        { intent: "plan_set_day", day: "thursday", recipe_query: "tacos" },
        "2026-08-27",
      ),
    ).toEqual({ kind: "swap_query", recipeQuery: "tacos" });
  });

  it("reads plan_set_multiplier as a per-dish portion change", () => {
    expect(
      planEventFromParse(
        { intent: "plan_set_multiplier", day: "sunday", multiplier: 2 },
        "2026-08-27",
      ),
    ).toEqual({ kind: "multiplier_query", multiplier: 2 });
    expect(planEventFromParse({ intent: "plan_lock" }, "2026-08-27")).toEqual({ kind: "lock" });
    expect(planEventFromParse({ intent: "add_item" }, "2026-08-27")).toBeNull();
  });
});

describe("batch range + overlap (the only multi-batch rule in scope)", () => {
  it("starts today when nothing is planned", () => {
    expect(nextBatchRange([], 5, "2026-08-27")).toEqual({
      startsOn: "2026-08-27",
      endsOn: "2026-08-31",
    });
  });

  it("starts the day after the last locked batch ends", () => {
    const locked = [{ id: "b1", starts_on: "2026-08-25", ends_on: "2026-08-28" }];
    expect(nextBatchRange(locked, 5, "2026-08-27")).toEqual({
      startsOn: "2026-08-29",
      endsOn: "2026-09-02",
    });
  });

  it("does not jump over a batch further out — that collision must be caught", () => {
    const locked = [{ id: "b2", starts_on: "2026-08-29", ends_on: "2026-09-02" }];
    const range = nextBatchRange(locked, 5, "2026-08-27");
    expect(range).toEqual({ startsOn: "2026-08-27", endsOn: "2026-08-31" });
    expect(findOverlappingBatch(locked, range)?.id).toBe("b2");
  });

  it("rejects a range that overlaps a locked batch", () => {
    const locked = [{ id: "b1", starts_on: "2026-09-01", ends_on: "2026-09-05" }];
    expect(
      findOverlappingBatch(locked, { startsOn: "2026-08-30", endsOn: "2026-09-02" })?.id,
    ).toBe("b1");
    expect(findOverlappingBatch(locked, { startsOn: "2026-09-06", endsOn: "2026-09-08" })).toBeNull();
  });

  it("formats a range the way the household reads dates", () => {
    expect(formatRange({ startsOn: "2026-08-28", endsOn: "2026-09-01" }, "sv")).toBe(
      "fre 28/8 → tis 1/9",
    );
  });
});

describe("draft rendering (pool, never a calendar)", () => {
  it("lists dishes with counts and badges the 🍱 pair — no weekday anywhere", () => {
    const text = renderDraft(
      [
        { id: "a", recipe_id: "chana-dal", servings_multiplier: 1 },
        { id: "b", recipe_id: "chana-dal", servings_multiplier: 1 },
        { id: "c", recipe_id: "mapo-tofu", servings_multiplier: 2 },
      ],
      RECIPES,
      "sv",
    );
    expect(text).toContain("🍱 ×2");
    expect(text).toContain("×2 portioner");
    expect(text).not.toMatch(/måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag/i);
    // the pair collapses to ONE line with a count, not two lines
    expect(text.split("\n").filter((l) => l.includes("Chana Dal"))).toHaveLength(1);
  });
});

describe("Script 5 replay — tap + text, one message edited in place", () => {
  it("drafts, edits by tap, doubles by text, and locks", async () => {
    const store = makeStore();
    const { chat, sent, edits, last } = makeChat();

    // "kan vi planera de närmsta dagarna?" — no horizon stated
    await handlePlanEvent(store, chat, ctx(), { kind: "start" });
    expect(sent).toHaveLength(1);
    expect(sent[0].buttons).toContain("p:h:5");
    expect(sent[0].buttons[0]).toBe("p:h:5"); // 5 days first (A.3 verdict)

    // tap [5 dagar] — the horizon question becomes the draft, in place
    await handlePlanEvent(store, chat, ctx({ messageId: 101 }), { kind: "draft", horizonDays: 5 });
    expect(sent).toHaveLength(1);
    expect(edits).toHaveLength(1);
    expect(store.pool).toHaveLength(5);
    expect(store.pool.every((r) => r.batch_id === null)).toBe(true);
    const draftIds = store.pool.map((r) => r.recipe_id);
    expect(new Set(draftIds).size).toBe(4); // 4 dishes, one cooked twice
    expect(last().buttons).toContain("p:l");

    // tap [✏️ Ändra] → [rätt] → [byt till …]
    await handlePlanEvent(store, chat, ctx({ messageId: 101 }), { kind: "edit_menu" });
    expect(last().buttons).toContain("p:x:0");
    await handlePlanEvent(store, chat, ctx({ messageId: 101 }), { kind: "pick_entry", index: 0 });
    const swapButton = last().buttons.find((b) => b.startsWith("p:s:0:"))!;
    expect(swapButton).toBeDefined();
    const swappedIn = swapButton.slice("p:s:0:".length);
    await handlePlanEvent(store, chat, ctx({ messageId: 101 }), parsePlanCallback(swapButton)!);
    expect(store.pool[0].recipe_id).toBe(swappedIn);
    expect(store.pool).toHaveLength(5);

    // free text: "kan vi köra dubbla portioner …" — one dish must be named,
    // so the bot asks with one tap per pool entry
    await handlePlanEvent(store, chat, ctx(), { kind: "multiplier_query", multiplier: 2 });
    const askedWhich = last();
    expect(askedWhich.buttons.some((b) => b.startsWith("p:m:"))).toBe(true);
    await handlePlanEvent(store, chat, ctx({ messageId: 101 }), {
      kind: "multiplier",
      index: 4,
      multiplier: 2,
    });
    expect(store.pool[4].servings_multiplier).toBe(2);

    // tap [✅ Lås]
    await handlePlanEvent(store, chat, ctx({ messageId: 101 }), { kind: "lock" });
    expect(store.batches).toHaveLength(1);
    expect(store.pool.every((r) => r.batch_id === "batch-1")).toBe(true);
    expect(store.items.get("batch-1")!.length).toBeGreaterThan(5);
    const locked = last();
    expect(locked.text).toContain("🔒");
    expect(locked.text).toMatch(/\d+ varor/);
    expect(locked.text).toMatch(/~\d+ kr/);
    expect(locked.text).toContain("cooked with compassion");
    expect(locked.buttons.some((b) => b.startsWith(cookModeBaseUrl()))).toBe(true);

    // the whole flow lived in ONE message after the first send
    expect(sent.filter((m) => m.buttons.length > 0)).toHaveLength(2);
    expect(edits.every((e) => e.messageId === 101)).toBe(true);
  });

  it("refuses to lock a range that overlaps an already locked batch", async () => {
    // a batch already locked a couple of days out: the 5-day draft starting
    // today would run straight into it
    const store = makeStore({
      batches: [{ id: "b0", starts_on: "2026-08-29", ends_on: "2026-09-02" }],
    });
    const { chat, last } = makeChat();
    await handlePlanEvent(store, chat, ctx(), { kind: "draft", horizonDays: 5 });
    await handlePlanEvent(store, chat, ctx(), { kind: "lock" });
    expect(store.batches).toHaveLength(1); // nothing new
    expect(last().text).toMatch(/redan/i);
    expect(store.pool.every((r) => r.batch_id === null)).toBe(true);
  });

  it("re-shows the open draft instead of silently replacing it", async () => {
    const store = makeStore();
    const { chat, last } = makeChat();
    await handlePlanEvent(store, chat, ctx(), { kind: "draft", horizonDays: 5 });
    const before = store.pool.map((r) => r.recipe_id);
    await handlePlanEvent(store, chat, ctx(), { kind: "start" });
    expect(store.pool.map((r) => r.recipe_id)).toEqual(before);
    expect(last().buttons).toContain("p:l");
  });

  it("rerolls into a different draft on request", async () => {
    const store = makeStore();
    const { chat } = makeChat();
    await handlePlanEvent(store, chat, ctx(), { kind: "draft", horizonDays: 5 });
    const before = store.pool.map((r) => r.recipe_id);
    await handlePlanEvent(store, chat, ctx(), { kind: "reroll" });
    const after = store.pool.map((r) => r.recipe_id);
    expect(after).toHaveLength(5);
    expect(after).not.toEqual(before);
    for (const id of after) expect(before).not.toContain(id);
  });
});

// A Bot API mock with Telegram's real failure mode: editMessageText is
// REJECTED ("message is not modified") when both text and keyboard equal what
// the message already shows. The bot swallows telegram errors by design (a
// failed reaction must never poison the queue row), so that rejection reaches
// the household as a tap that does nothing at all — exactly the live symptom
// this suite has to be able to catch.
function makeStrictChat() {
  const displayed = new Map<number, string>();
  const rejected: Array<{ messageId: number; text: string }> = [];
  const base = makeChat();
  return {
    ...base,
    rejected,
    chat: {
      send: async (text: string, buttons?: PlanButton[][]) => {
        const id = (await base.chat.send(text, buttons)) as number;
        displayed.set(id, JSON.stringify([text, buttons ?? []]));
        return id;
      },
      edit: async (messageId: number, text: string, buttons?: PlanButton[][]) => {
        const next = JSON.stringify([text, buttons ?? []]);
        if (displayed.get(messageId) === next) {
          rejected.push({ messageId, text });
          return; // Telegram: 400 "message is not modified" — nothing changes
        }
        displayed.set(messageId, next);
        await base.chat.edit(messageId, text, buttons);
      },
    },
  };
}

// The exact callback sequence from the 2026-08-27 live smoke, replayed against
// the real corpus. Pelle's second edit round ("p:e" → "p:x:0") produced no
// visible response in Telegram.
describe("live-20260827 replay: two edit rounds in one draft", () => {
  it("shows a fresh, non-identical message for every tap", async () => {
    const store = makeStore();
    const strict = makeStrictChat();
    const chat = strict.chat;
    const MSG = 101;

    await handlePlanEvent(store, chat, ctx(), { kind: "start" });
    for (const data of ["p:h:5", "p:e", "p:x:3"]) {
      await handlePlanEvent(store, chat, ctx({ messageId: MSG }), parsePlanCallback(data)!);
    }
    await handlePlanEvent(store, chat, ctx({ messageId: MSG }), {
      kind: "swap",
      index: 3,
      recipeId: "vegan-meatballs-creamed-macaroni",
    });
    expect(store.pool[3].recipe_id).toBe("vegan-meatballs-creamed-macaroni");

    // ...and now the SECOND round, which is where the live flow went quiet.
    const beforeSecondRound = strict.calls.length;
    await handlePlanEvent(store, chat, ctx({ messageId: MSG }), parsePlanCallback("p:e")!);
    expect(strict.calls.length, "the [✏️ Ändra] tap must render something").toBe(
      beforeSecondRound + 1,
    );
    await handlePlanEvent(store, chat, ctx({ messageId: MSG }), parsePlanCallback("p:x:0")!);
    expect(strict.calls.length, "the entry tap must render something").toBe(
      beforeSecondRound + 2,
    );

    const menu = strict.last();
    expect(menu.text).toContain(titleFor(store.pool[0].recipe_id));
    expect(menu.buttons.some((b) => b.startsWith("p:s:0:"))).toBe(true);
    expect(menu.buttons).toContain("p:m:0:2");
    expect(menu.buttons).toContain("p:rm:0");
    expect(strict.rejected, "no tap may be a no-op edit").toEqual([]);
  });

  it("offers a swap candidate for every entry, including duplicated ones", async () => {
    const store = makeStore();
    const { chat } = makeChat();
    await handlePlanEvent(store, chat, ctx(), { kind: "draft", horizonDays: 5 });
    const { chat: probe, calls } = makeChat();
    for (let index = 0; index < store.pool.length; index++) {
      await handlePlanEvent(store, probe, ctx({ messageId: 101 }), {
        kind: "pick_entry",
        index,
      });
      const menu = calls[calls.length - 1];
      expect(
        menu.buttons.filter((b) => b.startsWith(`p:s:${index}:`)).length,
        `entry ${index} must offer swaps`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("Script 6 — mid-batch swap keeps the list consistent", () => {
  it("regenerates the locked batch's list and offers the diff", async () => {
    const store = makeStore();
    const { chat, last } = makeChat();
    await handlePlanEvent(store, chat, ctx(), { kind: "draft", horizonDays: 5 });
    await handlePlanEvent(store, chat, ctx(), { kind: "lock" });
    const batchId = store.batches[0].id;

    // the household already shopped half the trip
    const before = store.items.get(batchId)!;
    before[0].checked_at = "2026-08-27T17:00:00Z";
    before[1].checked_at = "2026-08-27T17:00:00Z";
    const checkedNames = [before[0].display_name, before[1].display_name];

    const swapTarget = RECIPES.find((r) => !store.pool.some((p) => p.recipe_id === r.id))!;
    await handlePlanEvent(store, chat, ctx(), {
      kind: "swap",
      index: 0,
      recipeId: swapTarget.id,
    });

    expect(store.pool[0].recipe_id).toBe(swapTarget.id);
    const after = store.items.get(batchId)!;
    // checked rows survived the regeneration, ticks intact
    for (const name of checkedNames) {
      const row = after.find((r) => r.display_name === name);
      expect(row?.checked_at, `${name} must keep its tick`).toBeTruthy();
    }
    expect(last().buttons).toContain("p:dy");
    expect(last().buttons).toContain("p:dn");
  });

  it("shows what is left to buy, without stray quantity gaps", async () => {
    const store = makeStore();
    const { chat, last } = makeChat();
    await handlePlanEvent(store, chat, ctx(), { kind: "draft", horizonDays: 3 });
    await handlePlanEvent(store, chat, ctx(), { kind: "lock" });
    const rows = store.items.get("batch-1")!;
    rows[0].checked_at = "2026-08-27T17:00:00Z";
    await handlePlanEvent(store, chat, ctx(), { kind: "show_list" });
    const text = last().text;
    expect(text).toContain(`(${rows.length - 1})`);
    expect(text).not.toContain(rows[0].display_name);
    expect(text).not.toMatch(/ {2}/);
  });

  it("hands over the mini-list on [🛒 Ja, difflista]", async () => {
    const store = makeStore();
    const { chat, last } = makeChat();
    const session = { pendingDiff: { added: ["tortillas", "svarta bönor"] } };
    await handlePlanEvent(store, chat, { ...ctx({ messageId: 101 }), session }, {
      kind: "diff",
      accepted: true,
    });
    expect(last().text).toContain("tortillas");
    expect(session.pendingDiff).toBeUndefined();
  });
});

describe("checked-state preservation is the reconcile contract", () => {
  it("holds for the generated → regenerated pair used above", () => {
    const generated: GeneratedShoppingItem[] = [
      { canonicalIngredient: "garlic", displayName: "vitlök", quantity: 4, unit: "st", recipes: [] },
    ];
    const existing: ExistingItemRow[] = [
      {
        id: "x",
        canonical_ingredient: "garlic",
        display_name: "vitlök",
        quantity: 2,
        unit: "st",
        checked_at: "2026-08-27T10:00:00Z",
      },
    ];
    const plan = reconcileShoppingItems(existing, generated);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.updates).toEqual([{ id: "x", item: generated[0] }]);
  });
});
