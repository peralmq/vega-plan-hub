// Product-preference resolution (p4-01 read path + p4-04 learning writes):
// the shopping list swaps a canonical ingredient's display name for the
// household's currently preferred product ("mjölk" → "ICA Havredryck"). The
// store of record is the append-only product_preferences table — a row is
// current iff superseded_by is null. This module is the pure decision layer
// (r4 §1 "supersede, never update"): it decides WHAT to write, never talks to
// Supabase — bot/tools.ts and src/hooks/usePreferenceAdmin.ts do the actual
// insert-then-update round trip against the plans this returns.

export interface ProductPreferenceRowLike {
  canonical_ingredient: string;
  product_name: string;
  superseded_by: string | null;
  valid_from: string;
}

export interface PreferenceRow extends ProductPreferenceRowLike {
  id: string;
  source: "explicit" | "correction" | "observed";
  note: string | null;
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

// The current (non-superseded) row for one ingredient, or null when it has
// never been taught — or has been fully retired (p4-04 delete/undo-to-null).
// Defensive against more than one superseded_by=null row for the same
// ingredient (should never happen if every write goes through planSupersede/
// planUndo below, but a hand-seeded row — r4 §2 "seed by hand in week one" —
// could still produce one): latest valid_from wins, same tiebreak as
// currentPreferenceMap.
export function findCurrentRow(
  rows: PreferenceRow[],
  canonicalIngredient: string,
): PreferenceRow | null {
  const key = canonicalIngredient.toLowerCase();
  let current: PreferenceRow | null = null;
  for (const row of rows) {
    if (row.canonical_ingredient.toLowerCase() !== key) continue;
    if (row.superseded_by !== null) continue;
    if (!current || row.valid_from > current.valid_from) current = row;
  }
  return current;
}

export interface SupersedePlan {
  insert: {
    canonical_ingredient: string;
    product_name: string;
    family_member_id: null; // gate call (r4 §6.3): column kept, always null in v0
    source: "explicit" | "correction";
    note: string | null;
    // Explicit, not just relying on Postgres defaulting an omitted nullable
    // column to NULL: a freshly-inserted row must read as current the
    // instant it exists, in the fake test double as much as in Postgres.
    superseded_by: null;
  };
  // The row the insert supersedes (bot/hook must re-point ITS superseded_by
  // at the new row's id once it exists), and the source of the chat's
  // stated-memory reply ("was: Oatly Deluxe since March") / the admin page's
  // "since <date>". Null when the ingredient has never been taught before.
  previous: PreferenceRow | null;
}

// Step 1 of "insert + supersede atomically": decide the insert payload and
// name the row it replaces. `rows` may be the full table or just the rows
// for this ingredient — either way only rows matching canonicalIngredient
// are considered.
export function planSupersede(
  rows: PreferenceRow[],
  canonicalIngredient: string,
  productName: string,
  source: "explicit" | "correction",
  note: string | null = null,
): SupersedePlan {
  return {
    insert: {
      canonical_ingredient: canonicalIngredient,
      product_name: productName,
      family_member_id: null,
      source,
      note,
      superseded_by: null,
    },
    previous: findCurrentRow(rows, canonicalIngredient),
  };
}

export interface RetirePlan {
  retireId: string;
  // Never null — a self-reference marks "retired, nothing replaces it" (the
  // admin delete, or an undo with no prior preference) without ever putting
  // two current rows on the ingredient at once.
  retireSupersededBy: string;
  restoreId: string | null;
}

// `[Undo]` (chat, under every learning moment) and the admin "delete": both
// are "re-point superseded_by" (r4 §1), never a real DELETE or UPDATE of a
// row's own fields. Pass the id of the row being undone/deleted and, for
// undo, the id of the row it should restore (null retires with nothing to
// fall back to — the admin delete is exactly `planUndo(currentId, null)`).
export function planUndo(currentId: string, previousId: string | null): RetirePlan {
  return {
    retireId: currentId,
    retireSupersededBy: previousId ?? currentId,
    restoreId: previousId,
  };
}

// Chat voice (Script 3): a casual month reference — "was: Oatly Deluxe since
// March" — with the year folded in only once the memory crosses a year
// boundary, so a 14-month-old preference never reads as "this March". UTC
// throughout: valid_from is a timestamptz and the exact instant never
// matters here, only the calendar date, so this must not drift with the
// runtime's local timezone.
export function formatSinceMonth(iso: string, lang: "sv" | "en", now: Date = new Date()): string {
  const date = new Date(iso);
  const sameYear = date.getUTCFullYear() === now.getUTCFullYear();
  const locale = lang === "sv" ? "sv-SE" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(date);
}

// Admin page "since <date>" (the inspectability contract, r4 §1 / research
// plan A.8). App chrome stays English (design.spec "Voice and feel") — no
// language parameter.
export function formatSinceDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}
