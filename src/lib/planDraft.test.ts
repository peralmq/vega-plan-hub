// p4-03: the draft proposer. The contract under test is deliberately narrow —
// "good enough to edit against" (plan Non-goals) but DETERMINISTIC given a
// seed, so the conversation replay can assert exact dishes, and pool-shaped:
// a meal list with counts, never a day assignment (design.spec "Pool over
// calendar").

import { describe, expect, it } from "vitest";
import {
  DEFAULT_HORIZON_DAYS,
  HORIZON_CHOICES,
  addDays,
  daysUntilWeekday,
  distinctDishCount,
  mealPrepSuitability,
  proposeDraft,
  type DraftCandidate,
} from "./planDraft";

const RECIPES: DraftCandidate[] = [
  { id: "chana-dal", title: "Chana Dal", tags: ["Indian", "Dal", "Comfort Food"] },
  { id: "masoor-dal", title: "Masoor Dal", tags: ["Indian", "Dal", "Red Lentil"] },
  { id: "indian-garlic-dal", title: "Vitlöksdal", tags: ["Indian", "Dal", "Garlic"] },
  { id: "maa-ki-dal", title: "Maa Ki Dal", tags: ["Indian", "Dal", "Lentil"] },
  { id: "mapo-tofu", title: "Mapo Tofu", tags: ["Sichuan", "Chinese", "Spicy", "Tofu"] },
  { id: "fredagsmys-tacos", title: "Fredagsmys Tacos", tags: ["Mexican", "Tacos", "Quick"] },
  { id: "vegan-moussaka", title: "Vegansk moussaka", tags: ["Greek", "Casserole", "Batch"] },
  { id: "tofustroganoff", title: "Tofustroganoff", tags: ["Swedish", "Stroganoff", "Quick"] },
  { id: "deluxe-aglio-e-olio", title: "Aglio e olio", tags: ["Italian", "Pasta", "Quick"] },
  { id: "vegan-cowboy-soup", title: "Cowboysoppa", tags: ["Soup", "Family", "One-Pot"] },
];

const base = {
  recipes: RECIPES,
  ratings: new Map<string, number>(),
  lastCooked: new Map<string, string>(),
  todayIso: "2026-08-27",
  seed: "batch-1",
};

describe("horizon helpers", () => {
  it("defaults to 5 days with [5] offered first (r1 A.3 verdict 2026-08-27)", () => {
    expect(DEFAULT_HORIZON_DAYS).toBe(5);
    expect(HORIZON_CHOICES[0]).toBe(5);
  });

  it("counts days from today through a named weekday", () => {
    // 2026-08-27 is a Thursday.
    expect(daysUntilWeekday("2026-08-27", "sunday")).toBe(3);
    expect(daysUntilWeekday("2026-08-27", "wednesday")).toBe(6);
    // the same weekday means "a week from now", never zero days
    expect(daysUntilWeekday("2026-08-27", "thursday")).toBe(7);
    expect(daysUntilWeekday("2026-08-27", "nonsense")).toBeNull();
  });

  it("adds days across a month boundary", () => {
    expect(addDays("2026-08-27", 5)).toBe("2026-09-01");
    expect(addDays("2026-08-27", 0)).toBe("2026-08-27");
  });
});

describe("meal-prep suitability (stews/dals/soups first)", () => {
  it("ranks batch-friendly tags above everything else", () => {
    expect(mealPrepSuitability(["Greek", "Casserole", "Batch"])).toBeGreaterThan(
      mealPrepSuitability(["Indian", "Dal"]),
    );
    expect(mealPrepSuitability(["Indian", "Dal"])).toBeGreaterThan(
      mealPrepSuitability(["Swedish", "Comfort Food"]),
    );
    expect(mealPrepSuitability(["Mexican", "Tacos", "Quick"])).toBe(0);
  });
});

describe("proposeDraft", () => {
  it("proposes horizon-many pool entries, one dish twice for horizon >= 4", () => {
    const entries = proposeDraft({ ...base, horizonDays: 5 });
    expect(entries).toHaveLength(5);
    expect(new Set(entries.map((e) => e.recipeId)).size).toBe(4);
    expect(distinctDishCount(5)).toBe(4);
    // the duplicated dish is the meal prep: two rows, each 1× (the pool's
    // count IS the doubling — tech.spec "Pool model")
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.recipeId, (counts.get(e.recipeId) ?? 0) + 1);
    const prep = [...counts.entries()].find(([, n]) => n === 2);
    expect(prep).toBeDefined();
    expect(entries.every((e) => e.servingsMultiplier === 1)).toBe(true);
    const prepRecipe = RECIPES.find((r) => r.id === prep![0])!;
    expect(mealPrepSuitability(prepRecipe.tags)).toBeGreaterThan(0);
  });

  it("keeps the meal-prep pair adjacent so the 🍱 ×2 badge reads as one line", () => {
    const entries = proposeDraft({ ...base, horizonDays: 5 });
    const ids = entries.map((e) => e.recipeId);
    const dupe = ids.find((id, i) => ids.indexOf(id) !== i)!;
    expect(ids.indexOf(dupe) + 1).toBe(ids.lastIndexOf(dupe));
  });

  it("proposes no meal prep below a 4-day horizon", () => {
    const entries = proposeDraft({ ...base, horizonDays: 3 });
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((e) => e.recipeId)).size).toBe(3);
    expect(distinctDishCount(3)).toBe(3);
  });

  it("is deterministic for a seed and different across seeds", () => {
    const a = proposeDraft({ ...base, horizonDays: 5 });
    const b = proposeDraft({ ...base, horizonDays: 5 });
    expect(b).toEqual(a);
    const c = proposeDraft({ ...base, horizonDays: 5, seed: "batch-2" });
    expect(c.map((e) => e.recipeId)).not.toEqual(a.map((e) => e.recipeId));
  });

  it("favours favourites and skips what was just cooked", () => {
    const entries = proposeDraft({
      ...base,
      horizonDays: 3,
      ratings: new Map([
        ["fredagsmys-tacos", 5],
        ["mapo-tofu", 5],
        ["tofustroganoff", 1],
      ]),
      lastCooked: new Map([["mapo-tofu", "2026-08-26"]]),
    });
    const ids = entries.map((e) => e.recipeId);
    expect(ids).toContain("fredagsmys-tacos");
    // a 5-star dish cooked yesterday still loses to unrated-but-stale ones
    expect(ids).not.toContain("mapo-tofu");
    expect(ids).not.toContain("tofustroganoff");
  });

  it("does not stack a single cuisine (four dals is not a plan)", () => {
    const entries = proposeDraft({ ...base, horizonDays: 5 });
    const cuisines = entries
      .map((e) => RECIPES.find((r) => r.id === e.recipeId)!.tags[0])
      .filter((t) => t === "Indian");
    expect(cuisines.length).toBeLessThanOrEqual(2);
  });

  it("never proposes more dishes than the library holds", () => {
    const entries = proposeDraft({ ...base, recipes: RECIPES.slice(0, 2), horizonDays: 5 });
    expect(new Set(entries.map((e) => e.recipeId)).size).toBeLessThanOrEqual(2);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("returns nothing when the library is empty", () => {
    expect(proposeDraft({ ...base, recipes: [], horizonDays: 5 })).toEqual([]);
  });

  it("can exclude dishes already in the pool (reroll keeps its promise)", () => {
    const first = proposeDraft({ ...base, horizonDays: 3 });
    const second = proposeDraft({ ...base, horizonDays: 3, exclude: first.map((e) => e.recipeId) });
    for (const entry of second) expect(first.map((e) => e.recipeId)).not.toContain(entry.recipeId);
  });
});
