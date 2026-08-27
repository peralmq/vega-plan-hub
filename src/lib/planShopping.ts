// p4-03 steps 4–5: a batch pool → its shopping list, and back again after a
// swap. The aggregation is NOT re-implemented here — this module is a thin
// composition of the existing src/lib pipeline (scale → aggregate/normalize →
// preference-resolve) so the chat announcement and the web Shopping Summary
// are the same list by construction, not by coincidence
// (src/pages/ShoppingSummary.tsx calls aggregateBatchIngredients too).

import type { ParsedIngredient, ParsedRecipe } from "./recipeMarkdown";
import {
  aggregateIngredients,
  type AggregatedIngredient,
} from "./ingredientNormalization";
import { scaleIngredients } from "./ingredientScaling";
import { applyPreferredNames } from "./productPreferences";

export interface BatchMeal {
  recipe: ParsedRecipe;
  servingsMultiplier: number;
}

// The one pipeline. Every pool entry is scaled to its own multiplier first —
// a 🍱 pair is two entries, so the same recipe simply contributes twice and
// the list doubles with no meal-prep special case.
export function aggregateBatchIngredients(
  meals: BatchMeal[],
  preferences: Map<string, string>,
): AggregatedIngredient[] {
  const all: Array<{ ingredient: ParsedIngredient; recipeName: string }> = [];
  for (const { recipe, servingsMultiplier } of meals) {
    if (!recipe.ingredients) continue;
    const targetServings = Math.round(recipe.servings * servingsMultiplier);
    for (const ingredient of scaleIngredients(
      recipe.ingredients,
      recipe.servings,
      targetServings,
    )) {
      all.push({ ingredient, recipeName: recipe.title });
    }
  }
  return applyPreferredNames(aggregateIngredients(all), preferences);
}

// A `shopping_list_items` row waiting to be written (source = 'recipe').
export interface GeneratedShoppingItem {
  canonicalIngredient: string;
  displayName: string;
  quantity: number | null;
  unit: string | null;
  recipes: string[];
}

export function generateShoppingItems(
  meals: BatchMeal[],
  preferences: Map<string, string>,
): GeneratedShoppingItem[] {
  // applyPreferredNames rewrites displayName, so the canonical name is read
  // from the pre-preference aggregation: the row's identity must survive the
  // household switching brands (otherwise a preference change orphans the
  // checked state of every row it touches).
  const canonical = aggregateBatchIngredients(meals, new Map());
  const resolved = applyPreferredNames(canonical, preferences);
  return canonical.map((item, i) => ({
    canonicalIngredient: item.displayName,
    displayName: resolved[i].displayName,
    quantity: item.quantity > 0 ? item.quantity : null,
    unit: item.quantity > 0 && item.unit ? item.unit : null,
    recipes: item.recipes,
  }));
}

// ---------------------------------------------------------------------------
// Regeneration after a mid-batch swap (Script 6).

export interface ExistingItemRow {
  id: string;
  canonical_ingredient: string | null;
  display_name: string;
  quantity: number | null;
  unit: string | null;
  checked_at: string | null;
}

export interface ShoppingReconciliation {
  inserts: GeneratedShoppingItem[];
  updates: Array<{ id: string; item: GeneratedShoppingItem }>;
  deleteIds: string[];
  /** For the diff message: what the swap adds… */
  added: GeneratedShoppingItem[];
  /** …and what it takes off the list (already-bought rows are not removed). */
  removed: ExistingItemRow[];
  /** Checked-off rows carried through the regeneration untouched. */
  keptChecked: number;
}

// Row identity = canonical ingredient + unit. Canonical alone would merge a
// weight row and a volume row of the same ingredient (the aggregation keeps
// them apart on purpose, see getNormalizedIngredientKey).
const identity = (canonical: string | null, unit: string | null): string =>
  `${(canonical ?? "").toLowerCase()}|${unit ?? ""}`;

// The trust promise: regenerating a locked batch's list may never lose what
// the household already ticked off. Surviving rows are quantity-updated in
// place (checked_at is not in the patch, so it simply stays), and a row that
// the batch no longer needs is deleted only if it is still unchecked — an
// already-bought item stays on the trip it was bought for.
export function reconcileShoppingItems(
  existing: ExistingItemRow[],
  generated: GeneratedShoppingItem[],
): ShoppingReconciliation {
  const byKey = new Map<string, ExistingItemRow>();
  for (const row of existing) {
    const key = identity(row.canonical_ingredient, row.unit);
    if (!byKey.has(key)) byKey.set(key, row);
  }

  const plan: ShoppingReconciliation = {
    inserts: [],
    updates: [],
    deleteIds: [],
    added: [],
    removed: [],
    keptChecked: 0,
  };
  const matched = new Set<string>();

  for (const item of generated) {
    const key = identity(item.canonicalIngredient, item.unit);
    const row = byKey.get(key);
    if (!row) {
      plan.inserts.push(item);
      plan.added.push(item);
      continue;
    }
    matched.add(key);
    if (row.checked_at) plan.keptChecked++;
    if (row.quantity !== item.quantity || row.display_name !== item.displayName) {
      plan.updates.push({ id: row.id, item });
    }
  }

  for (const [key, row] of byKey) {
    if (matched.has(key)) continue;
    if (row.checked_at) {
      plan.keptChecked++;
      continue;
    }
    plan.deleteIds.push(row.id);
    plan.removed.push(row);
  }
  return plan;
}

// ---------------------------------------------------------------------------
// SEK estimate (plan step 4: the mathemPriceService mock is fine here).

export type PriceLookup = (name: string) => Promise<{ price: number; found: boolean }>;

// The corpus is Swedish-first (p4-14) while the mock price table is English,
// so most lookups miss. Announcing "~0 kr" would read as broken, so unpriced
// items count as the basket's median known price, or this placeholder when
// nothing at all is priced. Replaced for real by the P5 store comparison.
export const FALLBACK_ITEM_PRICE_SEK = 25;

export async function estimateBatchCostSEK(
  displayNames: string[],
  lookup: PriceLookup,
): Promise<number> {
  if (displayNames.length === 0) return 0;
  const results = await Promise.all(displayNames.map((name) => lookup(name)));
  const known = results.filter((r) => r.found && r.price > 0).map((r) => r.price);
  const sorted = [...known].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? FALLBACK_ITEM_PRICE_SEK
      : sorted[Math.floor((sorted.length - 1) / 2)];
  const total = known.reduce((sum, p) => sum + p, 0) + (results.length - known.length) * median;
  return Math.round(total);
}
