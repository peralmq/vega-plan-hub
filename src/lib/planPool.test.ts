import { describe, it, expect } from "vitest";
import {
  toISODate,
  findCurrentBatch,
  findNextBatch,
  rowsToPoolEntries,
  partitionPool,
  groupPoolByRecipe,
  type BatchRowLike,
  type PoolEntry,
} from "./planPool";

describe("toISODate", () => {
  it("formats a local date as yyyy-MM-dd", () => {
    expect(toISODate(new Date(2026, 7, 27))).toBe("2026-08-27");
  });
});

describe("findCurrentBatch", () => {
  const batches: BatchRowLike[] = [
    { id: "past", starts_on: "2026-08-01", ends_on: "2026-08-10" },
    { id: "active", starts_on: "2026-08-20", ends_on: "2026-08-30" },
    { id: "future", starts_on: "2026-09-01", ends_on: "2026-09-05" },
  ];

  it("returns the batch whose range covers today", () => {
    expect(findCurrentBatch(batches, "2026-08-27")).toEqual(batches[1]);
  });
  it("matches on the boundary dates (inclusive)", () => {
    expect(findCurrentBatch(batches, "2026-08-20")?.id).toBe("active");
    expect(findCurrentBatch(batches, "2026-08-30")?.id).toBe("active");
  });
  it("returns null when no batch covers today", () => {
    expect(findCurrentBatch(batches, "2026-08-15")).toBeNull();
  });
  it("returns null for an empty list", () => {
    expect(findCurrentBatch([], "2026-08-27")).toBeNull();
  });
});

describe("findNextBatch", () => {
  const batches: BatchRowLike[] = [
    { id: "active", starts_on: "2026-08-20", ends_on: "2026-08-30" },
    { id: "later", starts_on: "2026-09-10", ends_on: "2026-09-15" },
    { id: "soonest-upcoming", starts_on: "2026-09-01", ends_on: "2026-09-05" },
  ];

  it("returns the soonest batch that starts after today, excluding the current one", () => {
    expect(findNextBatch(batches, "2026-08-27", "active")?.id).toBe(
      "soonest-upcoming",
    );
  });
  it("returns null when nothing starts after today", () => {
    expect(findNextBatch([batches[0]], "2026-08-27", "active")).toBeNull();
  });
  it("returns null for an empty list", () => {
    expect(findNextBatch([], "2026-08-27")).toBeNull();
  });
});

describe("rowsToPoolEntries", () => {
  it("maps DB rows to pool entries, defaulting a null multiplier to 1", () => {
    const rows = [
      { id: "pm-1", recipe_id: "chana-dal", servings_multiplier: 2, cooked_on: null },
      { id: "pm-2", recipe_id: "mapo-tofu", servings_multiplier: null, cooked_on: "2026-08-27" },
    ];
    expect(rowsToPoolEntries(rows)).toEqual([
      { id: "pm-1", recipeId: "chana-dal", servingsMultiplier: 2, cookedOn: null },
      { id: "pm-2", recipeId: "mapo-tofu", servingsMultiplier: 1, cookedOn: "2026-08-27" },
    ]);
  });
});

describe("partitionPool", () => {
  const entries: PoolEntry[] = [
    { id: "a", recipeId: "chana-dal", servingsMultiplier: 1, cookedOn: null },
    { id: "b", recipeId: "mapo-tofu", servingsMultiplier: 1, cookedOn: "2026-08-26" },
    { id: "c", recipeId: "palak-paneer", servingsMultiplier: 1, cookedOn: null },
  ];

  it("splits entries into remaining (cookedOn null) and cooked", () => {
    expect(partitionPool(entries)).toEqual({
      remaining: [entries[0], entries[2]],
      cooked: [entries[1]],
    });
  });
  it("returns two empty arrays for an empty pool", () => {
    expect(partitionPool([])).toEqual({ remaining: [], cooked: [] });
  });
});

describe("groupPoolByRecipe (the 🍱 meal-prep badge)", () => {
  it("counts duplicate recipe_id entries as a single group with count 2", () => {
    const entries: PoolEntry[] = [
      { id: "a", recipeId: "chana-dal", servingsMultiplier: 1, cookedOn: null },
      { id: "b", recipeId: "chana-dal", servingsMultiplier: 1, cookedOn: null },
      { id: "c", recipeId: "mapo-tofu", servingsMultiplier: 1.5, cookedOn: null },
    ];
    const groups = groupPoolByRecipe(entries);
    expect(groups).toHaveLength(2);
    const dal = groups.find((g) => g.recipeId === "chana-dal");
    const tofu = groups.find((g) => g.recipeId === "mapo-tofu");
    expect(dal).toEqual({ recipeId: "chana-dal", count: 2, entries: [entries[0], entries[1]] });
    expect(tofu).toEqual({ recipeId: "mapo-tofu", count: 1, entries: [entries[2]] });
  });
  it("returns an empty list for an empty pool", () => {
    expect(groupPoolByRecipe([])).toEqual([]);
  });
});
