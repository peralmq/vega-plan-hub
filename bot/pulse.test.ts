// p4-05: the proactive layer at the seam the pure tests cannot see — the
// real Supabase query shapes, the Telegram calls the household would
// actually receive, and the scheduler tick that decides whether anything
// happens at all.
//
// The night-safety case is first on purpose: this suite is the standing
// proof that a runtime restarted at any hour of the night sends nothing.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeFakeSupabase, type FakeDb } from "./fakeSupabase";
import { loadRecipeLibrary } from "./recipeLibrary";
import { createPulse, memoryPulseStore, type PulseStore } from "./pulse";
import type { InboxRow } from "./tools";
import type { TelegramApi } from "./telegram";
import { encodeRatingCallback } from "../src/lib/proactivePulse";

const USER = "user-1";
const CHAT = 555;
const PROMPT_MESSAGE = 9100;
const REPO = process.cwd();
const DISH = "chana-dal";
const OTHER = "mapo-tofu";
const TODAY = "2026-08-31";

const at = (h: number, m: number): Date => new Date(2026, 7, 31, h, m, 0, 0);

interface Call {
  method: "send" | "edit" | "react" | "answer";
  text?: string;
  messageId?: number;
  buttons?: string[] | null;
}

function makeTelegram() {
  const calls: Call[] = [];
  const labels = (buttons?: Array<Array<{ callback_data?: string; url?: string }>>) =>
    buttons ? buttons.flat().map((b) => b.callback_data ?? b.url ?? "?") : null;
  const api = {
    sendMessage: async (
      _chat: number,
      text: string,
      buttons?: Parameters<typeof labels>[0],
    ) => {
      calls.push({ method: "send", text, buttons: labels(buttons) });
      return { message_id: PROMPT_MESSAGE };
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
  };
  return { calls, tg: api as unknown as TelegramApi };
}

interface PoolSeed {
  recipe_id: string;
  cooked_on?: string | null;
}

function seedDb(pool: PoolSeed[], batch = true): FakeDb {
  return {
    plan_batches: batch
      ? [{ id: "batch-1", user_id: USER, starts_on: "2026-08-28", ends_on: "2026-09-01" }]
      : [],
    planned_meals: pool.map((entry, i) => ({
      id: `pm-${i + 1}`,
      user_id: USER,
      batch_id: "batch-1",
      recipe_id: entry.recipe_id,
      servings_multiplier: 1,
      meal_date: null,
      cooked_on: entry.cooked_on ?? null,
      created_at: `2026-08-28T10:0${i}:00.000Z`,
    })),
    recipe_ratings: [],
    recipe_comments: [],
    family_members: [
      { id: "fm-1", name: "Pelle", user_id: USER },
      { id: "fm-2", name: "Wilma", user_id: USER },
    ],
    shopping_list_items: [],
  };
}

const library = loadRecipeLibrary(REPO);

function makePulse(db: FakeDb, store: PulseStore = memoryPulseStore()) {
  const supa = makeFakeSupabase(db);
  const { calls, tg } = makeTelegram();
  const pulse = createPulse({
    supa: supa as unknown as SupabaseClient,
    tg,
    userId: USER,
    chatId: CHAT,
    recipes: () => library,
    store,
  });
  return { pulse, calls, supa, store };
}

const ratingRow = (data: string, familyMemberId: string): InboxRow => ({
  id: 1,
  user_id: USER,
  chat_id: CHAT,
  message_id: PROMPT_MESSAGE,
  telegram_user_id: 7,
  family_member_id: familyMemberId,
  kind: "callback_query",
  text: data,
  payload: { callback_query: { id: "cb-1" } },
});

describe("night safety, live", () => {
  it("sends nothing on a tick at any hour of the night, however overdue", async () => {
    // A pool that would satisfy EVERY ping: one dinner left (runs-low),
    // something remaining (tonight), something cooked today (rating).
    const { pulse, calls } = makePulse(
      seedDb([{ recipe_id: DISH, cooked_on: TODAY }, { recipe_id: OTHER }]),
    );
    for (const hour of [0, 1, 3, 6, 23]) {
      await pulse.tick(at(hour, 30));
    }
    expect(calls).toEqual([]);
  });

  it("reports only future fire times when it arms just after midnight", () => {
    const { pulse } = makePulse(seedDb([{ recipe_id: DISH }]));
    const now = at(0, 30);
    const armed = pulse.nextFires(now);
    expect(armed).toHaveLength(3);
    for (const line of armed) {
      expect(line.at.getTime()).toBeGreaterThan(now.getTime());
      expect(line.at.getHours()).toBeGreaterThanOrEqual(16);
    }
  });
});

describe("runs-low nudge (Script 5)", () => {
  it("fires at 17:00 with one dinner left and opens the p4-03 horizon flow", async () => {
    const { pulse, calls } = makePulse(seedDb([{ recipe_id: DISH }]));
    await pulse.tick(at(17, 5));
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("send");
    expect(calls[0].text).toContain("planera");
    // Straight into the planning conversation: 5 days first (A.3 default).
    expect(calls[0].buttons).toEqual(["p:h:5", "p:h:3", "p:h:7", "p:c"]);
  });

  it("never fires twice for the same gap", async () => {
    const { pulse, calls } = makePulse(seedDb([{ recipe_id: DISH }]));
    await pulse.tick(at(17, 5));
    await pulse.tick(at(17, 15));
    expect(calls).toHaveLength(1);
  });

  it("stays quiet while the pool still has dinners in it", async () => {
    const { pulse, calls } = makePulse(
      seedDb([{ recipe_id: DISH }, { recipe_id: OTHER }]),
    );
    await pulse.tick(at(17, 5));
    expect(calls).toEqual([]);
  });
});

describe("tonight ping (Script 8)", () => {
  it("only speaks when a meal is actually planned", async () => {
    const cooked = makePulse(seedDb([{ recipe_id: DISH, cooked_on: TODAY }]));
    await cooked.pulse.tick(at(16, 5));
    expect(cooked.calls).toEqual([]);

    const { pulse, calls } = makePulse(seedDb([{ recipe_id: DISH }]));
    await pulse.tick(at(16, 5));
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("Chana Dal");
    expect(calls[0].buttons?.[1]).toBe("p:sl");
  });
});

describe("post-dinner rating (Script 8)", () => {
  it("asks only on a cooked evening", async () => {
    const uncooked = makePulse(seedDb([{ recipe_id: DISH }]));
    await uncooked.pulse.tick(at(21, 5));
    expect(uncooked.calls).toEqual([]);
  });

  it("edits ONE message in place as both partners tap", async () => {
    const db = seedDb([{ recipe_id: DISH, cooked_on: TODAY }]);
    const { pulse, calls, supa } = makePulse(db);
    await pulse.tick(at(21, 5));
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("Hur var");
    expect(calls[0].buttons).toEqual([
      encodeRatingCallback(5, DISH),
      encodeRatingCallback(4, DISH),
      encodeRatingCallback(3, DISH),
      encodeRatingCallback(1, DISH),
    ]);

    // P taps 😋, W taps 🤩 — same message, edited twice, keyboard kept live.
    expect(await pulse.handleRatingCallback(ratingRow(encodeRatingCallback(4, DISH), "fm-1"))).toBe(true);
    expect(await pulse.handleRatingCallback(ratingRow(encodeRatingCallback(5, DISH), "fm-2"))).toBe(true);

    const edits = calls.filter((c) => c.method === "edit");
    expect(edits).toHaveLength(2);
    expect(edits.every((e) => e.messageId === PROMPT_MESSAGE)).toBe(true);
    expect(edits[0].text).toContain("Pelle 😋");
    expect(edits[1].text).toContain("Pelle 😋");
    expect(edits[1].text).toContain("Wilma 🤩");
    expect(edits[1].buttons).toHaveLength(4); // still tappable for a change of heart

    // Written to the tables the web already reads (no new rating model).
    expect(db.recipe_ratings).toHaveLength(2);
    expect(db.recipe_ratings.map((r) => r.rating).sort()).toEqual([4, 5]);
    expect(db.recipe_ratings.every((r) => r.recipe_id === DISH && r.user_id === USER)).toBe(true);

    // A changed mind updates the same row instead of stacking a second one.
    await pulse.handleRatingCallback(ratingRow(encodeRatingCallback(3, DISH), "fm-1"));
    expect(db.recipe_ratings).toHaveLength(2);
    expect(supa.queries.some((q) => q.startsWith("update recipe_ratings"))).toBe(true);
  });

  it("ignores callback data that is not one of ours", async () => {
    const { pulse, calls } = makePulse(seedDb([{ recipe_id: DISH, cooked_on: TODAY }]));
    expect(await pulse.handleRatingCallback(ratingRow("p:l", "fm-1"))).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("per-ping mute", () => {
  it("silences exactly one ping type and says so", async () => {
    const store = memoryPulseStore();
    const first = makePulse(seedDb([{ recipe_id: DISH, cooked_on: TODAY }]), store);
    expect(await first.pulse.handleCommand("sluta påminna om betyg", CHAT)).toBe(true);
    expect(first.calls[0].text).toContain("🤫");

    // Muted at 21:00 …
    await first.pulse.tick(at(21, 5));
    expect(first.calls.filter((c) => c.text?.includes("Hur var"))).toHaveLength(0);

    // … while the other pings are untouched (state shared via the store).
    const second = makePulse(seedDb([{ recipe_id: DISH }]), store);
    await second.pulse.tick(at(17, 5));
    expect(second.calls).toHaveLength(1);
  });

  it("asks which one when the name is not a ping we know", async () => {
    const { pulse, calls } = makePulse(seedDb([{ recipe_id: DISH }]));
    expect(await pulse.handleCommand("sluta påminna om sopsortering", CHAT)).toBe(true);
    expect(calls[0].text).toContain("Vilken påminnelse");
  });

  it("leaves ordinary utterances to the NLU", async () => {
    const { pulse, calls } = makePulse(seedDb([{ recipe_id: DISH }]));
    expect(await pulse.handleCommand("köp mjölk", CHAT)).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("the week-one audit", () => {
  it("logs every proactive send, and /pulse reads it back", async () => {
    const store = memoryPulseStore();
    const { pulse, calls } = makePulse(seedDb([{ recipe_id: DISH }]), store);
    await pulse.tick(at(16, 5));
    await pulse.tick(at(17, 5));
    const log = store.read().log;
    expect(log.map((entry) => entry.type)).toEqual(["tonight", "runs_low"]);
    expect(log.every((entry) => entry.at.length > 0)).toBe(true);

    calls.length = 0;
    expect(await pulse.handleCommand("/pulse", CHAT)).toBe(true);
    expect(calls[0].text).toContain("middagstipset");
    expect(calls[0].text).toContain("17:00");
  });
});
