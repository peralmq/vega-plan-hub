// p4-10 step 6: the mocked Bot API test for menu delivery — album order
// matches the menu text's order, >10 photos truncates the album only (never
// the text/PDF), and resolveMenuTarget's fallback for "right after a lock
// whose range starts after today" (an earlier batch still covers today).
import { describe, expect, it } from "vitest";
import { loadRecipeLibrary } from "./recipeLibrary";
import { resolveMenuTarget, sendMenuCard } from "./menu";
import type { InlineButton, TelegramApi, MediaGroupPhoto } from "./telegram";
import type { PlanStore, PoolRow } from "../src/lib/planConversation";
import type { ExistingItemRow } from "../src/lib/planShopping";

const REPO = process.cwd();
const RECIPES = loadRecipeLibrary(REPO);

interface Call {
  method: "sendPhoto" | "sendMediaGroup" | "sendMessage" | "sendDocument";
  photos?: MediaGroupPhoto[];
  photoUrl?: string;
  text?: string;
  buttons?: InlineButton[][];
  parseMode?: string;
  filename?: string;
  content?: Buffer;
}

function makeTelegram() {
  const calls: Call[] = [];
  const api = {
    sendPhoto: async (_chatId: number, url: string) => {
      calls.push({ method: "sendPhoto", photoUrl: url });
    },
    sendMediaGroup: async (_chatId: number, photos: MediaGroupPhoto[]) => {
      calls.push({ method: "sendMediaGroup", photos });
    },
    sendMessage: async (_chatId: number, text: string, buttons?: InlineButton[][], parseMode?: string) => {
      calls.push({ method: "sendMessage", text, buttons, parseMode });
    },
    sendDocument: async (_chatId: number, filename: string, content: Buffer) => {
      calls.push({ method: "sendDocument", filename, content });
    },
  };
  return { calls, tg: api as unknown as TelegramApi };
}

// A minimal PlanStore double — only the methods sendMenuCard/resolveMenuTarget
// actually call are implemented, same "strict enough to be honest" spirit as
// bot/fakeSupabase.ts.
function makeStore(opts: {
  batches?: Array<{ id: string; starts_on: string; ends_on: string }>;
  entriesByBatch: Record<string, PoolRow[]>;
  itemsByBatch?: Record<string, ExistingItemRow[]>;
}): PlanStore {
  const batches = opts.batches ?? [];
  const items = opts.itemsByBatch ?? {};
  return {
    recipes: () => RECIPES,
    ratings: async () => new Map(),
    lastCooked: async () => new Map(),
    preferences: async () => new Map(),
    loadDraft: async () => [],
    loadCurrentBatch: async (todayIso: string) => {
      const batch = batches.find((b) => b.starts_on <= todayIso && todayIso <= b.ends_on);
      if (!batch) return null;
      return { batch, entries: opts.entriesByBatch[batch.id] ?? [] };
    },
    loadLockedBatches: async () => batches,
    loadBatchEntries: async (batchId: string) => opts.entriesByBatch[batchId] ?? [],
    replaceDraft: async () => {},
    updateEntry: async () => {},
    deleteEntry: async () => {},
    insertEntry: async () => {},
    lockBatch: async () => "unused",
    loadBatchItems: async (batchId: string) => items[batchId] ?? [],
    applyItemPlan: async () => {},
    estimateSek: async (names: string[]) => names.length * 20,
  };
}

const entries = (recipeIds: string[]): PoolRow[] =>
  recipeIds.map((recipe_id, i) => ({ id: `e${i}`, recipe_id, servings_multiplier: 1 }));

describe("resolveMenuTarget", () => {
  it("picks the batch covering today when there is one", async () => {
    const store = makeStore({
      batches: [{ id: "b1", starts_on: "2026-08-25", ends_on: "2026-08-29" }],
      entriesByBatch: { b1: entries([RECIPES[0].id]) },
    });
    expect(await resolveMenuTarget(store, "2026-08-27")).toEqual({
      batchId: "b1",
      startsOn: "2026-08-25",
      endsOn: "2026-08-29",
    });
  });

  // The immediate post-lock case: a household with an already-running batch
  // locks the NEXT one, whose range starts after today — loadCurrentBatch
  // can't see it yet, so the fallback must still find it (the most recently
  // locked, by starts_on) rather than showing the stale current menu.
  it("falls back to the most recently locked batch when none covers today", async () => {
    const store = makeStore({
      batches: [
        { id: "old", starts_on: "2026-08-20", ends_on: "2026-08-24" },
        { id: "new", starts_on: "2026-09-01", ends_on: "2026-09-05" },
      ],
      entriesByBatch: { old: entries([RECIPES[0].id]), new: entries([RECIPES[1].id]) },
    });
    expect(await resolveMenuTarget(store, "2026-08-27")).toEqual({
      batchId: "new",
      startsOn: "2026-09-01",
      endsOn: "2026-09-05",
    });
  });

  it("returns null when nothing has ever been locked", async () => {
    const store = makeStore({ entriesByBatch: {} });
    expect(await resolveMenuTarget(store, "2026-08-27")).toBeNull();
  });
});

describe("sendMenuCard", () => {
  it("sends the album, then the HTML menu message, then the PDF — in that order", async () => {
    const { calls, tg } = makeTelegram();
    const ids = RECIPES.slice(0, 4).map((r) => r.id);
    const store = makeStore({
      batches: [{ id: "b1", starts_on: "2026-08-27", ends_on: "2026-08-30" }],
      entriesByBatch: { b1: entries(ids) },
      itemsByBatch: {
        b1: ids.map((id, i) => ({
          id: `i${i}`,
          canonical_ingredient: id,
          display_name: id,
          quantity: null,
          unit: null,
          checked_at: null,
        })),
      },
    });
    const fakePdf = Buffer.from("pdf-bytes");
    let renderedHtml = "";
    await sendMenuCard(
      store,
      tg,
      555,
      { batchId: "b1", startsOn: "2026-08-27", endsOn: "2026-08-30" },
      async (html) => {
        renderedHtml = html;
        return fakePdf;
      },
    );

    expect(calls.map((c) => c.method)).toEqual(["sendMediaGroup", "sendMessage", "sendDocument"]);
    const [album, menu, doc] = calls;
    expect(album.photos).toHaveLength(4);
    expect(menu.parseMode).toBe("HTML");
    // album order matches the menu text's dish order.
    for (const id of ids) expect(menu.text, id).toContain(`recipe=${id}`);
    const positions = ids.map((id) => menu.text!.indexOf(`recipe=${id}`));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(doc.filename).toBe("veckans-meny.pdf");
    expect(doc.content).toBe(fakePdf);
    expect(renderedHtml).toContain("<html");
  });

  // Telegram's sendMediaGroup rejects fewer than 2 items — a batch that is
  // entirely one storkok/meal-prep dish (a supported, real scenario: e.g.
  // a 1-day lock, or a whole horizon that's a single doubled dish) has
  // exactly ONE distinct photo, so it must go through sendPhoto instead.
  it("uses sendPhoto (not sendMediaGroup) when the batch has exactly one distinct dish", async () => {
    const { calls, tg } = makeTelegram();
    const store = makeStore({
      batches: [{ id: "solo", starts_on: "2026-08-27", ends_on: "2026-08-28" }],
      entriesByBatch: { solo: entries([RECIPES[0].id, RECIPES[0].id]) }, // storkok pair, 1 distinct dish
    });
    await sendMenuCard(
      store,
      tg,
      555,
      { batchId: "solo", startsOn: "2026-08-27", endsOn: "2026-08-28" },
      async () => Buffer.from("x"),
    );
    expect(calls.map((c) => c.method)).toEqual(["sendPhoto", "sendMessage", "sendDocument"]);
    expect(calls[0].photoUrl).toMatch(/^https?:\/\//); // sanity: a real image URL, not empty
  });

  it("truncates the ALBUM at 10 for >10 distinct dishes, but never the menu text", async () => {
    const { calls, tg } = makeTelegram();
    const ids = RECIPES.slice(0, 12).map((r) => r.id);
    expect(ids.length).toBe(12); // guard: the shipped corpus must have ≥12 recipes for this case
    const store = makeStore({
      batches: [{ id: "big", starts_on: "2026-08-27", ends_on: "2026-09-07" }],
      entriesByBatch: { big: entries(ids) },
    });
    await sendMenuCard(
      store,
      tg,
      555,
      { batchId: "big", startsOn: "2026-08-27", endsOn: "2026-09-07" },
      async () => Buffer.from("x"),
    );
    const album = calls.find((c) => c.method === "sendMediaGroup")!;
    const menu = calls.find((c) => c.method === "sendMessage")!;
    expect(album.photos).toHaveLength(10);
    for (const id of ids) expect(menu.text, id).toContain(`recipe=${id}`);
  });

  it("skips the sendMediaGroup call entirely for an empty pool (no crash on 0 photos)", async () => {
    const { calls, tg } = makeTelegram();
    const store = makeStore({
      batches: [{ id: "empty", starts_on: "2026-08-27", ends_on: "2026-08-27" }],
      entriesByBatch: { empty: [] },
    });
    await sendMenuCard(
      store,
      tg,
      555,
      { batchId: "empty", startsOn: "2026-08-27", endsOn: "2026-08-27" },
      async () => Buffer.from("x"),
    );
    expect(calls.map((c) => c.method)).toEqual(["sendMessage", "sendDocument"]);
  });
});
