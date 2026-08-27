// p4-03 steps 4–5: batch → shopping list, and the mid-batch swap that must
// keep the list trustworthy (Script 6's hard promise). The aggregation itself
// is NOT re-implemented here — these tests pin that the batch path runs the
// same src/lib pipeline the web Shopping Summary renders.

import { describe, expect, it } from "vitest";
import {
  FALLBACK_ITEM_PRICE_SEK,
  aggregateBatchIngredients,
  estimateBatchCostSEK,
  generateShoppingItems,
  reconcileShoppingItems,
  type ExistingItemRow,
} from "./planShopping";
import { aggregateIngredients } from "./ingredientNormalization";
import { scaleIngredients } from "./ingredientScaling";
import type { ParsedRecipe } from "./recipeMarkdown";

function recipe(id: string, ingredients: Array<[string, string, string]>): ParsedRecipe {
  return {
    id,
    title: id,
    image: "",
    cookTime: 30,
    servings: 4,
    difficulty: "Easy",
    tags: ["Vegan"],
    theme: "Vegan Favorites",
    ingredients: ingredients.map(([quantity, unit, ingredient]) => ({
      quantity,
      unit,
      key: ingredient,
      ingredient,
      notes: "",
    })),
    instructions: ["cook"],
  };
}

const DAL = recipe("dal", [
  ["200", "g", "red lentils"],
  ["2", "st", "garlic"],
  ["1", "tsp", "cumin"],
]);
const PASTA = recipe("pasta", [
  ["400", "g", "pasta"],
  ["4", "st", "garlic"],
]);

describe("aggregateBatchIngredients (the shared pipeline)", () => {
  it("matches scale → aggregate → preference-resolve, run by hand", () => {
    const meals = [
      { recipe: DAL, servingsMultiplier: 2 },
      { recipe: PASTA, servingsMultiplier: 1 },
    ];
    const byHand = aggregateIngredients([
      ...scaleIngredients(DAL.ingredients, 4, 8).map((ingredient) => ({
        ingredient,
        recipeName: DAL.title,
      })),
      ...scaleIngredients(PASTA.ingredients, 4, 4).map((ingredient) => ({
        ingredient,
        recipeName: PASTA.title,
      })),
    ]);
    expect(aggregateBatchIngredients(meals, new Map())).toEqual(byHand);
  });

  it("sums the same ingredient across dishes and doubles a 🍱 pair", () => {
    const single = aggregateBatchIngredients([{ recipe: DAL, servingsMultiplier: 1 }], new Map());
    const pair = aggregateBatchIngredients(
      [
        { recipe: DAL, servingsMultiplier: 1 },
        { recipe: DAL, servingsMultiplier: 1 },
      ],
      new Map(),
    );
    const lentils = (list: typeof single) => list.find((i) => i.displayName === "red lentils")!;
    expect(lentils(pair).quantity).toBe(lentils(single).quantity * 2);
  });

  it("resolves the household's preferred product at generate time", () => {
    const items = generateShoppingItems(
      [{ recipe: DAL, servingsMultiplier: 1 }],
      new Map([["red lentils", "ICA Röda linser"]]),
    );
    const lentils = items.find((i) => i.canonicalIngredient === "red lentils")!;
    expect(lentils.displayName).toBe("ICA Röda linser");
    // the canonical name is what the row is matched by later — never the
    // product name, or a preference change would orphan the checked state
    expect(lentils.canonicalIngredient).toBe("red lentils");
  });
});

describe("reconcileShoppingItems (Script 6: swap without losing the trip)", () => {
  const generated = generateShoppingItems(
    [
      { recipe: DAL, servingsMultiplier: 1 },
      { recipe: PASTA, servingsMultiplier: 1 },
    ],
    new Map(),
  );

  const existingFrom = (
    items: typeof generated,
    checked: string[] = [],
  ): ExistingItemRow[] =>
    items.map((item, i) => ({
      id: `row-${i}`,
      canonical_ingredient: item.canonicalIngredient,
      unit: item.unit,
      quantity: item.quantity,
      display_name: item.displayName,
      checked_at: checked.includes(item.canonicalIngredient) ? "2026-08-27T10:00:00Z" : null,
    }));

  it("is a no-op when nothing changed", () => {
    const plan = reconcileShoppingItems(existingFrom(generated), generated);
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.added).toEqual([]);
    expect(plan.removed).toEqual([]);
  });

  it("adds what the new dish needs and drops what the old one did", () => {
    const swapped = generateShoppingItems(
      [
        { recipe: DAL, servingsMultiplier: 1 },
        { recipe: recipe("tacos", [["8", "st", "tortillas"]]), servingsMultiplier: 1 },
      ],
      new Map(),
    );
    const plan = reconcileShoppingItems(existingFrom(generated), swapped);
    expect(plan.added.map((i) => i.canonicalIngredient)).toEqual(["tortillas"]);
    expect(plan.removed.map((i) => i.display_name)).toEqual(["pasta"]);
    // garlic stays on the list (both dishes want it), with a new quantity
    expect(plan.updates.map((u) => u.item.canonicalIngredient)).toContain("garlic");
  });

  it("preserves checked-off rows: never re-inserted, never deleted", () => {
    const existing = existingFrom(generated, ["pasta", "garlic"]);
    const swapped = generateShoppingItems([{ recipe: DAL, servingsMultiplier: 1 }], new Map());
    const plan = reconcileShoppingItems(existing, swapped);
    // "pasta" is gone from the batch but already in the basket — keep it
    const pastaRow = existing.find((r) => r.canonical_ingredient === "pasta")!;
    expect(plan.deleteIds).not.toContain(pastaRow.id);
    expect(plan.removed.map((i) => i.display_name)).not.toContain("pasta");
    expect(plan.keptChecked).toBe(2);
    // the surviving checked row is only ever quantity-updated: no insert can
    // resurrect it as an unchecked duplicate
    expect(plan.inserts.map((i) => i.canonicalIngredient)).not.toContain("garlic");
  });

  it("matches by canonical ingredient AND unit, so g and ml never merge", () => {
    const generatedNow = generateShoppingItems([{ recipe: DAL, servingsMultiplier: 1 }], new Map());
    const existing = existingFrom(generatedNow).map((row) =>
      row.canonical_ingredient === "red lentils" ? { ...row, unit: "ml" } : row,
    );
    const plan = reconcileShoppingItems(existing, generatedNow);
    expect(plan.added.map((i) => i.canonicalIngredient)).toEqual(["red lentils"]);
    expect(plan.removed.map((i) => i.display_name)).toEqual(["red lentils"]);
  });
});

describe("estimateBatchCostSEK", () => {
  const lookup = async (name: string) =>
    name === "pasta" ? { price: 15.95, found: true } : { price: 0, found: false };

  it("sums what the price service knows and fills the rest with the basket median", () => {
    return expect(estimateBatchCostSEK(["pasta", "garlic"], lookup)).resolves.toBe(32);
  });

  it("falls back to a flat placeholder when nothing is priced", async () => {
    const blind = async () => ({ price: 0, found: false });
    await expect(estimateBatchCostSEK(["a", "b"], blind)).resolves.toBe(
      2 * FALLBACK_ITEM_PRICE_SEK,
    );
    await expect(estimateBatchCostSEK([], blind)).resolves.toBe(0);
  });
});
