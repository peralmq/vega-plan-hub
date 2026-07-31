// Product-preference resolution (p4-01, read path only): the shopping list
// swaps a canonical ingredient's display name for the household's currently
// preferred product ("mjölk" → "ICA Havredryck"). The store of record is the
// append-only product_preferences table — a row is current iff superseded_by
// is null; learning flows that WRITE rows land in p4-04.

export interface ProductPreferenceRowLike {
  canonical_ingredient: string;
  product_name: string;
  superseded_by: string | null;
  valid_from: string;
}

export function currentPreferenceMap(
  rows: ProductPreferenceRowLike[],
): Map<string, string> {
  const latest = new Map<string, ProductPreferenceRowLike>();
  for (const row of rows) {
    if (row.superseded_by !== null) continue;
    const key = row.canonical_ingredient.toLowerCase();
    const existing = latest.get(key);
    if (!existing || row.valid_from > existing.valid_from) latest.set(key, row);
  }
  return new Map(
    [...latest.entries()].map(([key, row]) => [key, row.product_name]),
  );
}

export function applyPreferredNames<T extends { displayName: string }>(
  items: T[],
  preferences: Map<string, string>,
): T[] {
  if (preferences.size === 0) return items;
  return items.map((item) => {
    const preferred = preferences.get(item.displayName.toLowerCase());
    return preferred ? { ...item, displayName: preferred } : item;
  });
}
