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
import { handleCallback, handleMessage, type InboxRow, type RecipeRepoDeps, type StateMap } from "./tools";
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
  product_preferences: [],
  family_members: [{ id: "fm-1", name: "Pelle", user_id: USER }],
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
