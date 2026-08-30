// Bot-level regression suite (added 2026-08-27 after the p4-03 live smoke).
//
// Everything here is about the seam the pure src/lib tests cannot see: the
// real Supabase adapter (bot/planning.ts) and the callback router in
// bot/tools.ts. The live failure that prompted it — a planning message that
// lost its buttons and went silent — was invisible to every existing test
// because it lived exactly here, in what handleCallback does with a
// callback_data it does not recognise.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  handleCallback,
  handleMessage,
  runTracesReview,
  type InboxRow,
  type RecipeRepoDeps,
  type StateMap,
} from "./tools";
import { makeFakeSupabase, type FakeDb } from "./fakeSupabase";
import { loadRecipeLibrary } from "./recipeLibrary";
import type { TelegramApi } from "./telegram";
import { addDays } from "../src/lib/planDraft";
import { localIsoDate } from "../src/lib/recipeNotes";

const USER = "user-1";
const CHAT = 555;
const BOT_MESSAGE = 4242;
const REPO = process.cwd();

interface Call {
  method: "send" | "edit" | "react" | "answer" | "media" | "document";
  text?: string;
  messageId?: number;
  buttons?: string[] | null;
  parseMode?: string;
  photoCount?: number;
  filename?: string;
}

// Records what the household would actually see. `buttons: null` means the
// call left the existing keyboard alone; `[]` means it cleared it.
function makeTelegram() {
  const calls: Call[] = [];
  const labels = (buttons?: Array<Array<{ callback_data?: string; url?: string }>>) =>
    buttons ? buttons.flat().map((b) => b.callback_data ?? b.url ?? "?") : null;
  const api = {
    sendMessage: async (
      _chat: number,
      text: string,
      buttons?: Parameters<typeof labels>[0],
      parseMode?: string,
    ) => {
      calls.push({ method: "send", text, buttons: labels(buttons), parseMode });
      return { message_id: BOT_MESSAGE };
    },
    editMessageText: async (
      _chat: number,
      messageId: number,
      text: string,
      buttons?: Parameters<typeof labels>[0],
    ) => {
      calls.push({ method: "edit", messageId, text, buttons: labels(buttons) });
    },
    react: async () => {
      calls.push({ method: "react" });
    },
    answerCallbackQuery: async () => {
      calls.push({ method: "answer" });
    },
    // p4-10: the menu card's album + PDF document.
    sendMediaGroup: async (_chat: number, photos: unknown[]) => {
      calls.push({ method: "media", photoCount: photos.length });
    },
    sendDocument: async (_chat: number, filename: string) => {
      calls.push({ method: "document", filename });
    },
  };
  return { calls, tg: api as unknown as TelegramApi };
}

const emptyDb = (): FakeDb => ({
  planned_meals: [],
  plan_batches: [],
  shopping_list_items: [],
  recipe_ratings: [],
  recipe_comments: [],
  product_preferences: [],
  family_members: [{ id: "fm-1", name: "Pelle", user_id: USER }],
  nlu_traces: [],
});

const repo = (): RecipeRepoDeps => {
  const library = loadRecipeLibrary(REPO);
  return {
    index: () => library.map((r) => ({ id: r.id, title: r.title })),
    library: () => library,
    synonyms: () => [],
    read: () => "",
    publishNote: async () => ({ committed: true, pushed: true }),
    publishEdit: async () => ({ committed: true, pushed: true }),
  };
};

const callbackRow = (data: string): InboxRow => ({
  id: 1,
  user_id: USER,
  chat_id: CHAT,
  message_id: BOT_MESSAGE,
  telegram_user_id: 7,
  family_member_id: "fm-1",
  kind: "callback_query",
  text: data,
  payload: { callback_query: { id: "cb-1" } },
});

const messageRow = (text: string): InboxRow => ({
  ...callbackRow(text),
  kind: "message",
  message_id: 9001,
  payload: {},
});

describe("handleCallback: unknown callback_data must not touch the message", () => {
  it("answers and stops — no edit, no keyboard wipe", async () => {
    const { calls, tg } = makeTelegram();
    const supa = makeFakeSupabase(emptyDb()) as unknown as SupabaseClient;
    const states: StateMap = new Map();
    // A button from a future build, and one from an older one.
    for (const data of ["p:brandnew:1", "some_old_button"]) {
      await handleCallback(supa, tg, callbackRow(data), states, repo());
    }
    expect(calls.filter((c) => c.method === "edit")).toEqual([]);
    expect(calls.filter((c) => c.method === "answer")).toHaveLength(2);
  });

  it("still acknowledges the two preference buttons, clearing their keyboard", async () => {
    const { calls, tg } = makeTelegram();
    const supa = makeFakeSupabase(emptyDb()) as unknown as SupabaseClient;
    await handleCallback(supa, tg, callbackRow("once"), new Map(), repo());
    const edit = calls.find((c) => c.method === "edit")!;
    expect(edit.text).toContain("Bara denna gång");
    expect(edit.buttons).toEqual([]);
  });
});

describe("one inbound → bounded outbound (no stray stub)", () => {
  it("plan_draft with a horizon answers with exactly one message", async () => {
    const { calls, tg } = makeTelegram();
    const supa = makeFakeSupabase(emptyDb()) as unknown as SupabaseClient;
    await handleMessage(
      supa,
      tg,
      messageRow("planera 5 dagar"),
      { intent: "plan_draft", horizon: "5" },
      new Map(),
      repo(),
    );
    const spoken = calls.filter((c) => c.method === "send" || c.method === "edit");
    expect(spoken).toHaveLength(1);
    expect(spoken[0].method).toBe("send");
    expect(spoken[0].text).toContain("Utkast");
    // the p4-02 "not yet" stub must never ride along with a handled intent
    for (const call of spoken) expect(call.text).not.toContain("🚧");
  });

  it("plan_draft without a horizon asks once, with the 5-day button first", async () => {
    const { calls, tg } = makeTelegram();
    const supa = makeFakeSupabase(emptyDb()) as unknown as SupabaseClient;
    await handleMessage(supa, tg, messageRow("kan vi planera?"), { intent: "plan_draft" }, new Map(), repo());
    const spoken = calls.filter((c) => c.method === "send" || c.method === "edit");
    expect(spoken).toHaveLength(1);
    expect(spoken[0].buttons?.[0]).toBe("p:h:5");
  });

  it("every planning tap answers the callback and rewrites exactly one message", async () => {
    const { calls, tg } = makeTelegram();
    const supa = makeFakeSupabase(emptyDb()) as unknown as SupabaseClient;
    const states: StateMap = new Map();
    await handleCallback(supa, tg, callbackRow("p:h:5"), states, repo());
    const spoken = calls.filter((c) => c.method === "send" || c.method === "edit");
    expect(spoken).toHaveLength(1);
    expect(spoken[0].method).toBe("edit");
    expect(spoken[0].messageId).toBe(BOT_MESSAGE);
    expect(calls.filter((c) => c.method === "answer")).toHaveLength(1);
  });
});

// The exact live sequence, this time through the real Supabase adapter.
describe("live-20260827 replay through the bot seam", () => {
  it("keeps a keyboard on every step of two edit rounds", async () => {
    const { calls, tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();
    const deps = repo();

    const tap = async (data: string) => {
      await handleCallback(supa, tg, callbackRow(data), states, deps);
      const spoken = calls.filter((c) => c.method === "send" || c.method === "edit");
      return spoken[spoken.length - 1];
    };

    const draft = await tap("p:h:5");
    expect(draft.buttons).toContain("p:l");
    expect(fake.db.planned_meals).toHaveLength(5);

    expect((await tap("p:e")).buttons).toContain("p:x:3:0");
    const entryMenu = await tap("p:x:3:0");
    const swap = entryMenu.buttons!.find((b) => b.startsWith("p:s:3:"))!;
    expect(swap).toBeDefined();
    await tap(swap);

    // …and the second round, which went silent live.
    const menuAgain = await tap("p:e");
    expect(menuAgain.buttons).toContain("p:x:0:0");
    const entryZero = await tap("p:x:0:0");
    expect(entryZero.buttons!.some((b) => b.startsWith("p:s:0:"))).toBe(true);
    expect(entryZero.buttons).toContain("p:rm:0");

    // No step may hand back a message with no way forward, and every step
    // edits the ONE message (design.spec "Chat voice").
    const spoken = calls.filter((c) => c.method === "send" || c.method === "edit");
    for (const call of spoken) {
      expect(call.messageId, call.text).toBe(BOT_MESSAGE);
      expect(call.buttons?.length, call.text).toBeGreaterThan(0);
    }
    // Every read/update/delete the adapter issued is scoped to the household
    // user (RLS is the real guard, but a missing scope would also mean a
    // partner's rows leaking into a draft); inserts carry user_id instead.
    for (const query of fake.queries) {
      if (query.startsWith("insert ")) continue;
      expect(query, query).toContain("eq(user_id)");
    }
    for (const table of ["planned_meals", "plan_batches", "shopping_list_items"]) {
      for (const row of fake.db[table]) expect(row.user_id, table).toBe(USER);
    }
  });

  // live-feedback round 2 (2026-08-27), through the real adapter: the picker
  // must reach past the same handful, and storkok must write a second row.
  it("pages the swap picker through new dishes on every tap", async () => {
    const { calls, tg } = makeTelegram();
    const supa = makeFakeSupabase(emptyDb()) as unknown as SupabaseClient;
    const states: StateMap = new Map();
    const deps = repo();
    await handleCallback(supa, tg, callbackRow("p:h:5"), states, deps);

    const offered = new Set<string>();
    for (let page = 0; page < 6; page++) {
      await handleCallback(supa, tg, callbackRow(`p:x:0:${page}`), states, deps);
      const menu = calls.filter((c) => c.method === "edit").pop()!;
      for (const b of menu.buttons!.filter((x) => x.startsWith("p:s:0:"))) {
        offered.add(b.slice("p:s:0:".length));
      }
      expect(menu.buttons!.some((b) => b.startsWith("p:x:0:")), `page ${page} pager`).toBe(true);
    }
    expect(offered.size).toBeGreaterThanOrEqual(16);
  });

  it("storkok writes a second pool row and keeps the multiplier alone", async () => {
    const { calls, tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();
    const deps = repo();
    await handleCallback(supa, tg, callbackRow("p:h:5"), states, deps);
    const before = fake.db.planned_meals.length;
    // The draft always carries one 🍱 pair, but which slot it lands in shifts
    // with the day's rotation — find it rather than assuming index 0. A dish
    // that already is a storkok must make the toggle a no-op.
    const paired = fake.db.planned_meals.findIndex(
      (row, _i, all) => all.filter((r) => r.recipe_id === row.recipe_id).length > 1,
    );
    await handleCallback(supa, tg, callbackRow(`p:k:${paired}:1`), states, deps);
    expect(fake.db.planned_meals).toHaveLength(before);
    const solo = fake.db.planned_meals.findIndex(
      (row, _i, all) => all.filter((r) => r.recipe_id === row.recipe_id).length === 1,
    );

    await handleCallback(supa, tg, callbackRow(`p:k:${solo}:1`), states, deps);
    expect(fake.db.planned_meals).toHaveLength(before + 1);
    expect(fake.db.planned_meals.every((r) => r.servings_multiplier === 1)).toBe(true);
    expect(fake.db.planned_meals.every((r) => r.meal_date === null)).toBe(true);
    expect(calls.filter((c) => c.method === "edit").pop()!.text).toContain("🍱");

    await handleCallback(supa, tg, callbackRow(`p:k:${solo}:0`), states, deps);
    expect(fake.db.planned_meals).toHaveLength(before);
  });

  it("takes storkok from free text, by dish name", async () => {
    const { tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();
    const deps = repo();
    await handleCallback(supa, tg, callbackRow("p:h:5"), states, deps);
    const before = fake.db.planned_meals.length;
    const soloRow = fake.db.planned_meals.find(
      (row, _i, all) => all.filter((r) => r.recipe_id === row.recipe_id).length === 1,
    )!;
    const title = deps.library().find((r) => r.id === soloRow.recipe_id)!.title;

    await handleMessage(
      supa,
      tg,
      messageRow(`storkok på ${title}`),
      { intent: "plan_set_storkok", recipe_query: title, on: true },
      states,
      deps,
    );
    expect(fake.db.planned_meals.length).toBeGreaterThan(before);
  });

  it("locks the draft into a batch with a generated list", async () => {
    const { calls, tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();
    const deps = repo();
    await handleCallback(supa, tg, callbackRow("p:h:5"), states, deps);
    await handleCallback(supa, tg, callbackRow("p:l"), states, deps);

    expect(fake.db.plan_batches).toHaveLength(1);
    expect(fake.db.planned_meals.every((r) => r.batch_id === fake.db.plan_batches[0].id)).toBe(true);
    expect(fake.db.shopping_list_items.length).toBeGreaterThan(5);
    expect(fake.db.shopping_list_items.every((r) => r.source === "recipe" && r.batch_id)).toBe(true);
    const locked = calls.filter((c) => c.method === "edit").pop()!;
    expect(locked.text).toContain("🔒");
    expect(locked.text).toContain("cooked with compassion");
  });

  // p4-10 Verification: "lock in the mocked p4-03 flow ends with album +
  // menu message in order" — the lock announcement (edit) is immediately
  // followed by the menu card's own send sequence.
  it("locking sends the Swedish menu card — album, then HTML menu, then PDF", async () => {
    const { calls, tg } = makeTelegram();
    const supa = makeFakeSupabase(emptyDb()) as unknown as SupabaseClient;
    const states: StateMap = new Map();
    const deps = repo();
    await handleCallback(supa, tg, callbackRow("p:h:5"), states, deps);
    await handleCallback(supa, tg, callbackRow("p:l"), states, deps);

    const after = calls.slice(calls.findIndex((c) => c.method === "edit" && c.text?.includes("🔒")));
    expect(after.map((c) => c.method)).toEqual(["edit", "media", "send", "document"]);
    expect(after[1].photoCount).toBeGreaterThan(0);
    expect(after[2].parseMode).toBe("HTML");
    expect(after[2].text).toContain("VECKANS MENY");
    expect(after[2].buttons).toContain("p:sl"); // 🛒 Inköpslista reuses the p4-03 vocabulary
    expect(after[3].filename).toBe("veckans-meny.pdf");
  }, 30_000);

  // The same live-feedback overlap guard as elsewhere: a lock that fails
  // (nothing new committed) must never trigger a menu send.
  it("does not send a menu when the lock is refused (overlap clash)", async () => {
    const { calls, tg } = makeTelegram();
    const seeded = emptyDb();
    // Starts a couple of days OUT (does not cover today), so a fresh 5-day
    // draft starting today collides with it instead of chaining after it —
    // the same "does not jump over a batch further out" scenario as
    // src/lib/planConversation.test.ts. The bot reads the real clock
    // (localIsoDate), so the seed must be relative to it, not hard-coded.
    const today = localIsoDate();
    seeded.plan_batches = [
      { id: "b1", user_id: USER, starts_on: addDays(today, 2), ends_on: addDays(today, 6) },
    ];
    const supa = makeFakeSupabase(seeded) as unknown as SupabaseClient;
    const states: StateMap = new Map();
    const deps = repo();
    await handleCallback(supa, tg, callbackRow("p:h:5"), states, deps);
    await handleCallback(supa, tg, callbackRow("p:l"), states, deps);

    expect(calls.some((c) => c.method === "media" || c.method === "document")).toBe(false);
    const refused = calls.filter((c) => c.method === "edit").pop()!;
    expect(refused.text).toContain("🚧");
  });
});

// p4-04: Script 3 (r1-conversation-scripts.md) end to end — explicit
// switches and the correction-as-teaching path both write append-only
// product_preferences rows through the real fake-Supabase adapter, and
// [Undo] re-points superseded_by rather than deleting anything.
describe("p4-04: preference learning (Script 3)", () => {
  const priorRow = () => ({
    id: "pref-1",
    user_id: USER,
    canonical_ingredient: "mjölk",
    product_name: "Oatly Havredryck Deluxe",
    superseded_by: null,
    valid_from: "2026-03-01T00:00:00Z",
    source: "explicit" as const,
    note: null,
  });

  it("set_preference inserts + supersedes atomically and replies with stated memory + [Undo]", async () => {
    const { calls, tg } = makeTelegram();
    const seeded = emptyDb();
    seeded.product_preferences = [priorRow()];
    const fake = makeFakeSupabase(seeded);
    const supa = fake as unknown as SupabaseClient;
    await handleMessage(
      supa,
      tg,
      messageRow("btw vi har bytt från oatly deluxe till ica havredryck, den är billigare"),
      { intent: "set_preference", ingredient: "mjölk", product: "ICA Havredryck" },
      new Map(),
      repo(),
    );

    const rows = fake.db.product_preferences;
    expect(rows).toHaveLength(2);
    const current = rows.find((r) => r.product_name === "ICA Havredryck")!;
    expect(current.superseded_by).toBeNull();
    expect(current.source).toBe("explicit");
    expect(current.family_member_id).toBeNull();
    expect(rows.find((r) => r.id === "pref-1")!.superseded_by).toBe(current.id);

    const sent = calls.find((c) => c.method === "send")!;
    expect(sent.text).toContain("ICA Havredryck");
    expect(sent.text).toContain("Oatly Havredryck Deluxe");
    expect(sent.text).toContain("mars"); // valid_from month, sv default
    expect(sent.buttons).toEqual(["pref_undo"]);
  });

  it("set_preference with nothing taught before it skips the 'was:' clause", async () => {
    const { calls, tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    await handleMessage(
      supa,
      tg,
      messageRow("vi kör alpro istället för arla nu"),
      { intent: "set_preference", ingredient: "mjölk", product: "Alpro" },
      new Map(),
      repo(),
    );
    expect(fake.db.product_preferences).toHaveLength(1);
    const sent = calls.find((c) => c.method === "send")!;
    expect(sent.text).not.toMatch(/var:|was:/);
  });

  it('"nej, penne" then [New usual] teaches the ORIGINAL bucket ("pasta"), tagged source=correction', async () => {
    const { calls, tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();

    await handleMessage(supa, tg, messageRow("köp pasta"), { intent: "add_item", items: ["pasta"] }, states, repo());
    await handleMessage(
      supa,
      tg,
      messageRow("nej, penne"),
      { intent: "correct_last", replacement: "penne" },
      states,
      repo(),
    );
    const corrected = calls.filter((c) => c.method === "send").pop()!;
    expect(corrected.text).toContain("penne");
    expect(corrected.buttons).toEqual(["corr_usual", "corr_once"]);

    await handleCallback(supa, tg, callbackRow("corr_usual"), states, repo());
    expect(fake.db.product_preferences).toHaveLength(1);
    expect(fake.db.product_preferences[0]).toMatchObject({
      canonical_ingredient: "pasta",
      product_name: "penne",
      source: "correction",
      superseded_by: null,
    });
    // the list item itself was already corrected to penne's own canonical
    // bucket (unchanged p4-02 behaviour) — the taught preference is scoped
    // to what the household was ORIGINALLY shopping for, per Script 3.
    expect(fake.db.shopping_list_items[0].canonical_ingredient).toBe("penne");
  });

  it('"nej, penne" then [One-off] writes no preference row', async () => {
    const { tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();
    await handleMessage(supa, tg, messageRow("köp pasta"), { intent: "add_item", items: ["pasta"] }, states, repo());
    await handleMessage(
      supa,
      tg,
      messageRow("nej, penne"),
      { intent: "correct_last", replacement: "penne" },
      states,
      repo(),
    );
    await handleCallback(supa, tg, callbackRow("corr_once"), states, repo());
    expect(fake.db.product_preferences).toHaveLength(0);
  });

  it("a stale [New usual]/[Undo] tap after a restart asks again instead of guessing", async () => {
    const { calls, tg } = makeTelegram();
    const supa = makeFakeSupabase(emptyDb()) as unknown as SupabaseClient;
    for (const data of ["corr_usual", "corr_once", "pref_undo"]) {
      await handleCallback(supa, tg, callbackRow(data), new Map(), repo());
    }
    const edits = calls.filter((c) => c.method === "edit");
    expect(edits).toHaveLength(3);
    for (const edit of edits) expect(edit.text).not.toContain("undefined");
  });

  it("[Undo] restores the prior current row and re-points the new one — never deletes", async () => {
    const { tg } = makeTelegram();
    const seeded = emptyDb();
    seeded.product_preferences = [priorRow()];
    const fake = makeFakeSupabase(seeded);
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();
    await handleMessage(
      supa,
      tg,
      messageRow("vi har bytt till ica havredryck"),
      { intent: "set_preference", ingredient: "mjölk", product: "ICA Havredryck" },
      states,
      repo(),
    );
    await handleCallback(supa, tg, callbackRow("pref_undo"), states, repo());

    const rows = fake.db.product_preferences;
    expect(rows).toHaveLength(2); // nothing deleted, append-only
    const restored = rows.find((r) => r.id === "pref-1")!;
    expect(restored.superseded_by).toBeNull();
    const undone = rows.find((r) => r.id !== "pref-1")!;
    expect(undone.superseded_by).toBe("pref-1");
  });

  it("[Undo] with nothing before it retires the just-taught row onto itself", async () => {
    const { tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();
    await handleMessage(
      supa,
      tg,
      messageRow("vi kör alpro nu"),
      { intent: "set_preference", ingredient: "mjölk", product: "Alpro" },
      states,
      repo(),
    );
    await handleCallback(supa, tg, callbackRow("pref_undo"), states, repo());

    const rows = fake.db.product_preferences;
    expect(rows).toHaveLength(1); // never deleted
    expect(rows[0].superseded_by).toBe(rows[0].id);
  });

  it("undo is single-use — the crumb is cleared after acting, a second tap is a stale-tap reply", async () => {
    const { calls, tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();
    await handleMessage(
      supa,
      tg,
      messageRow("vi kör alpro nu"),
      { intent: "set_preference", ingredient: "mjölk", product: "Alpro" },
      states,
      repo(),
    );
    await handleCallback(supa, tg, callbackRow("pref_undo"), states, repo());
    await handleCallback(supa, tg, callbackRow("pref_undo"), states, repo());
    expect(fake.db.product_preferences).toHaveLength(1); // no second write
    expect(calls.filter((c) => c.method === "edit").pop()!.text).not.toContain("undefined");
  });

  it("a taught preference resolves the very next add (the research-plan round trip)", async () => {
    const { tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();
    await handleMessage(
      supa,
      tg,
      messageRow("vi har bytt till ica havredryck"),
      { intent: "set_preference", ingredient: "mjölk", product: "ICA Havredryck" },
      states,
      repo(),
    );
    await handleMessage(
      supa,
      tg,
      messageRow("köp mjölk"),
      { intent: "add_item", items: ["mjölk"] },
      states,
      repo(),
    );
    const added = fake.db.shopping_list_items.find((r) => r.canonical_ingredient === "mjölk")!;
    expect(added.display_name).toBe("ICA Havredryck");
  });
});

describe("p4-06: NLU trace capture wired through handleMessage/handleCallback", () => {
  const traceMeta = { source: "rules" as const, model: "rules", harnessVersion: "test", latencyMs: 5 };

  it("every parse writes a trace, unsettled", async () => {
    const { tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    await handleMessage(
      supa,
      tg,
      messageRow("köp pasta"),
      { intent: "add_item", items: ["pasta"] },
      new Map(),
      repo(),
      traceMeta,
    );
    expect(fake.db.nlu_traces).toHaveLength(1);
    expect(fake.db.nlu_traces[0]).toMatchObject({ utterance: "köp pasta", label: "unsettled" });
  });

  it("a scripted correct→corrected pair yields one implicit-wrong trace with the repair as corrected_parse", async () => {
    const { tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();
    await handleMessage(
      supa,
      tg,
      messageRow("köp pasta"),
      { intent: "add_item", items: ["pasta"] },
      states,
      repo(),
      traceMeta,
    );
    await handleMessage(
      supa,
      tg,
      messageRow("nej, penne"),
      { intent: "correct_last", replacement: "penne" },
      states,
      repo(),
      traceMeta,
    );
    const overturned = fake.db.nlu_traces.find((t) => t.utterance === "köp pasta")!;
    expect(overturned.label).toBe("implicit_wrong");
    expect(overturned.label_source).toBe("correction");
    expect(overturned.corrected_parse).toEqual({ intent: "add_item", items: ["penne"] });
  });

  it("no traceMeta (a pre-p4-06 caller) never writes a trace and never breaks the insert", async () => {
    const { tg } = makeTelegram();
    const fake = makeFakeSupabase(emptyDb());
    const supa = fake as unknown as SupabaseClient;
    await handleMessage(supa, tg, messageRow("köp pasta"), { intent: "add_item", items: ["pasta"] }, new Map(), repo());
    expect(fake.db.nlu_traces).toHaveLength(0);
    expect(fake.db.shopping_list_items).toHaveLength(1);
  });

  it("degrades gracefully when nlu_traces is missing — message handling still completes", async () => {
    const db = emptyDb() as Record<string, unknown[]>;
    delete db.nlu_traces;
    const { tg } = makeTelegram();
    const fake = makeFakeSupabase(db as unknown as FakeDb);
    const supa = fake as unknown as SupabaseClient;
    await handleMessage(
      supa,
      tg,
      messageRow("köp pasta"),
      { intent: "add_item", items: ["pasta"] },
      new Map(),
      repo(),
      traceMeta,
    );
    expect(fake.db.shopping_list_items).toHaveLength(1); // the household still got their item
  });

  it("/traces sends one message per unsettled trace with one-tap buttons, and [✅ rätt] confirms it", async () => {
    const { calls, tg } = makeTelegram();
    const fake = makeFakeSupabase({
      ...emptyDb(),
      nlu_traces: [
        {
          id: "trace-1",
          user_id: USER,
          utterance: "köp pasta",
          parse: { intent: "add_item", items: ["pasta"] },
          label: "unsettled",
          created_at: new Date().toISOString(),
        },
      ],
    });
    const supa = fake as unknown as SupabaseClient;
    await runTracesReview(supa, tg, messageRow(""), "sv");
    const sent = calls.find((c) => c.method === "send")!;
    expect(sent.text).toContain("köp pasta");
    expect(sent.buttons).toEqual(["nlu_ok:trace-1", "nlu_wrong:trace-1"]);

    await handleCallback(supa, tg, callbackRow("nlu_ok:trace-1"), new Map(), repo());
    expect(fake.db.nlu_traces[0].label).toBe("confirmed_correct");
    expect(fake.db.nlu_traces[0].label_source).toBe("review");
    const edit = calls.find((c) => c.method === "edit")!;
    expect(edit.buttons).toEqual([]);
  });

  it("/traces with nothing unsettled says so instead of sending an empty digest", async () => {
    const { calls, tg } = makeTelegram();
    const supa = makeFakeSupabase(emptyDb()) as unknown as SupabaseClient;
    await runTracesReview(supa, tg, messageRow(""), "sv");
    expect(calls.filter((c) => c.method === "send")).toHaveLength(1);
    expect(calls[0].text).toContain("Inget att granska");
  });
});

// p4-05 Step 4: "notes resurface in cook mode". The web renders
// `recipe_comments` under a recipe (RecipeComments in CookMode.tsx); the
// markdown `## Notes` section the p4-08 path writes is parsed but never
// displayed. So the confirmed note goes BOTH places from the one existing
// confirm-and-publish path — no second capture flow, no new table.
describe("p4-05: a saved note also lands where Cook Mode shows it", () => {
  it("mirrors the confirmed note into recipe_comments for that recipe", async () => {
    const { calls, tg } = makeTelegram();
    const db = emptyDb();
    db.planned_meals.push({
      id: "pm-1",
      user_id: USER,
      batch_id: null,
      recipe_id: "chana-dal",
      servings_multiplier: 1,
      meal_date: null,
      cooked_on: localIsoDate(),
      created_at: "2026-08-31T18:00:00.000Z",
    });
    const fake = makeFakeSupabase(db);
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();

    await handleMessage(
      supa,
      tg,
      messageRow("mindre stark nästa gång bara"),
      { intent: "note_recipe", note: "mindre stark" },
      states,
      repo(),
    );
    expect(calls[calls.length - 1].buttons).toEqual(["note_yes", "note_no"]);

    await handleCallback(supa, tg, callbackRow("note_yes"), states, repo());
    expect(fake.db.recipe_comments).toHaveLength(1);
    expect(fake.db.recipe_comments[0].recipe_id).toBe("chana-dal");
    expect(fake.db.recipe_comments[0].user_id).toBe(USER);
    expect(String(fake.db.recipe_comments[0].content)).toContain("Mindre stark");
  });

  it("declining the note writes nothing anywhere", async () => {
    const { calls, tg } = makeTelegram();
    const db = emptyDb();
    db.planned_meals.push({
      id: "pm-1",
      user_id: USER,
      batch_id: null,
      recipe_id: "chana-dal",
      servings_multiplier: 1,
      meal_date: null,
      cooked_on: localIsoDate(),
      created_at: "2026-08-31T18:00:00.000Z",
    });
    const fake = makeFakeSupabase(db);
    const supa = fake as unknown as SupabaseClient;
    const states: StateMap = new Map();
    await handleMessage(
      supa,
      tg,
      messageRow("mindre stark nästa gång bara"),
      { intent: "note_recipe", note: "mindre stark" },
      states,
      repo(),
    );
    await handleCallback(supa, tg, callbackRow("note_no"), states, repo());
    expect(fake.db.recipe_comments).toEqual([]);
    expect(calls[calls.length - 1].text).toContain("Skippar");
  });
});
