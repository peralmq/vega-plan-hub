// p5-05: locked batch → compare-list mapping. Pure and fixture-tested
// (batchMap.test.ts) — the Supabase fetch + household sign-in that supplies
// these rows lives in batchFetch.ts (network I/O, evidence-only, same split
// as storeCompare.ts/stores.ts for the --list path).
//
// shopping_list_items (p4-01 schema) is the source of record for what's on
// a locked batch's list; product_preferences is the source of record for
// "which product does <ingredient> mean" but carries no store column, so a
// store affinity can only ever be *inferred* — from a store's own brand
// name appearing in the preferred product's name (e.g. "ICA Havredryck",
// "Coop Änglamark Kikärtor"). No match = no affinity (any store), the same
// "stores: null" convention a hand-written --list entry uses.
import { currentPreferenceMap } from "@/lib/productPreferences";
import type { ListItem } from "@/lib/storeRotation";

export interface PlanBatchRow {
  id: string;
  locked_at: string;
}

export interface ShoppingListItemRow {
  canonical_ingredient: string | null;
  display_name: string;
  quantity: number | null;
  unit: string | null;
  checked_at: string | null;
}

export interface ProductPreferenceRow {
  canonical_ingredient: string;
  product_name: string;
  superseded_by: string | null;
  valid_from: string;
}

export interface BatchListEntry {
  /** Crosses into the existing pipeline unchanged — the same shape a
   * hand-written --list file produces via parseListEntries. */
  item: ListItem;
  /** Quantity + unit as recorded on the shopping list, e.g. "1000 g" or "3
   * st" — printed next to the matched line for human review only. The
   * pipeline stays one-unit-per-term (product.spec non-goal: no
   * quantity-aware cart fill), so this value never crosses into `item`. */
  annotation: string | null;
}

const STORE_TOKENS: { store: string; pattern: RegExp }[] = [
  { store: "ica", pattern: /\bica\b/ },
  { store: "willys", pattern: /\bwillys\b/ },
  { store: "hemkop", pattern: /\bhemkop\b/ },
  { store: "coop", pattern: /\bcoop\b/ },
  { store: "mathem", pattern: /\bmathem\b/ },
];

/** Swedish diacritics fold away so "Hemköp" matches the "hemkop" store key
 * (compare's store keys are already plain-ASCII, e.g. --stores hemkop). */
const normalize = (s: string): string => s.toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o");

/**
 * Store affinity inferred from a preferred product's name: which store
 * keys' own brand token appears in it, as a whole word (so "Coophallen" or
 * "Icakupong" — a single compound word — never false-positive). Multiple
 * tokens can match (unlikely but not excluded); no token match returns
 * null (unrestricted), never an empty array (storeRotation.ts rejects
 * empty affinity lists as a mistake, not "nowhere").
 */
export function storeAffinityFromProductName(productName: string): string[] | null {
  const normalized = normalize(productName);
  const matches = STORE_TOKENS.filter(({ pattern }) => pattern.test(normalized)).map((t) => t.store);
  return matches.length > 0 ? matches : null;
}

/** "1000 g", "3 st", "2" — omits the unit when absent; null (no annotation
 * printed) when the row has no quantity at all. */
export function formatQuantity(quantity: number | null, unit: string | null): string | null {
  if (quantity == null) return null;
  return unit ? `${quantity} ${unit}` : String(quantity);
}

/** `--batch latest`'s selection logic, kept pure and separately testable
 * from the Supabase fetch: the batch with the greatest `locked_at`, or
 * null when there are no batches at all (batchFetch.ts turns that into a
 * user-facing error before any mapping happens). */
export function pickLatestBatch(batches: PlanBatchRow[]): string | null {
  if (batches.length === 0) return null;
  return batches.reduce((latest, b) => (b.locked_at > latest.locked_at ? b : latest)).id;
}

/**
 * shopping_list_items + product_preferences → p5-01 list entries.
 * Already-checked rows are excluded (they're bought). Preference lookup
 * keys on canonical_ingredient when the row has one (recipe-derived rows
 * always do); ad-hoc rows without one fall back to their own display name,
 * on the chance the household filed a preference under that exact name.
 */
export function batchRowsToCompareList(
  items: ShoppingListItemRow[],
  preferences: ProductPreferenceRow[],
): BatchListEntry[] {
  const preferredNames = currentPreferenceMap(preferences);
  return items
    .filter((row) => row.checked_at === null)
    .map((row) => {
      const key = (row.canonical_ingredient ?? row.display_name).toLowerCase();
      const preferred = preferredNames.get(key) ?? null;
      return {
        item: { term: row.display_name, stores: preferred ? storeAffinityFromProductName(preferred) : null },
        annotation: formatQuantity(row.quantity, row.unit),
      };
    });
}
