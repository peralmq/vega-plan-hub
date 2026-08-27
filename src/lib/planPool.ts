// Pure pool logic (p4-12, tech.spec.md "Pool model"): `planned_meals` rows
// are batch pool entries, not date assignments — a meal prep is the same
// `recipe_id` twice. This module has no Supabase/React dependency so the
// batch-selection and cooked/remaining-partition rules are unit-testable in
// isolation; `src/hooks/useBatchPool.ts` is the only caller.

import { format } from "date-fns";

export const toISODate = (d: Date): string => format(d, "yyyy-MM-dd");

export interface BatchRowLike {
  id: string;
  starts_on: string; // yyyy-MM-dd
  ends_on?: string; // chat-side sizing hint only — never read here
}

// Open-ended batches (design.spec "Pool over calendar", directive Pelle
// 2026-08-27 evening): a batch never expires by date — nobody knows when
// the last dishes get cooked. The active batch is simply the one that
// STARTED most recently (starts_on <= today); locking a newer batch is
// the reset that supersedes it. `ends_on` is ignored entirely.
export function findCurrentBatch(
  batches: BatchRowLike[],
  todayIso: string,
): BatchRowLike | null {
  const started = batches.filter((b) => b.starts_on <= todayIso);
  if (started.length === 0) return null;
  return started.reduce((latest, b) =>
    b.starts_on > latest.starts_on ? b : latest,
  );
}

// The soonest batch that starts after today, excluding `excludeId` (the
// current batch, if any) — mirrors the old current/next-week window over
// the new arbitrary-range batches.
export function findNextBatch(
  batches: BatchRowLike[],
  todayIso: string,
  excludeId?: string,
): BatchRowLike | null {
  const upcoming = batches.filter(
    (b) => b.id !== excludeId && b.starts_on > todayIso,
  );
  if (upcoming.length === 0) return null;
  return upcoming.reduce((soonest, b) =>
    b.starts_on < soonest.starts_on ? b : soonest,
  );
}

export interface PoolEntryRowLike {
  id: string;
  recipe_id: string;
  servings_multiplier: number | null;
  cooked_on: string | null;
}

export interface PoolEntry {
  id: string;
  recipeId: string;
  servingsMultiplier: number; // 1.0 = normal
  cookedOn: string | null; // yyyy-MM-dd once picked/cooked; null while remaining
}

export function rowsToPoolEntries(rows: PoolEntryRowLike[]): PoolEntry[] {
  return rows.map((row) => ({
    id: row.id,
    recipeId: row.recipe_id,
    servingsMultiplier: row.servings_multiplier ?? 1,
    cookedOn: row.cooked_on,
  }));
}

export interface PoolPartition<T extends PoolEntry = PoolEntry> {
  remaining: T[];
  cooked: T[];
}

// Cooked/remaining split — the picker shows `remaining`; `cooked` entries
// render as done (design.spec.md, Cook Mode). Generic over T so callers
// that decorate PoolEntry (e.g. useBatchPool's PoolMeal, which adds the
// resolved `recipe`) keep that shape through the split.
export function partitionPool<T extends PoolEntry>(entries: T[]): PoolPartition<T> {
  return {
    remaining: entries.filter((e) => e.cookedOn === null),
    cooked: entries.filter((e) => e.cookedOn !== null),
  };
}

// Storkok (directive Pelle 2026-08-27, same semantics as the chat toggle):
// a big batch is simply the SAME RECIPE TWICE in the pool — cook once, the
// second entry is the leftovers night. Never the servings multiplier, which
// stays family-size. This decides what one tap on 🍱 Storkok should do; the
// caller performs the add/remove through the DB hook.
export type StorkokAction =
  | { action: "add"; recipeId: string; servingsMultiplier: number }
  | { action: "remove"; entryId: string };

export function planStorkokToggle<T extends PoolEntry>(
  entries: T[],
  recipeId: string,
): StorkokAction | null {
  const siblings = entries.filter((e) => e.recipeId === recipeId);
  if (siblings.length === 0) return null;
  if (siblings.length === 1) {
    return {
      action: "add",
      recipeId,
      servingsMultiplier: siblings[0].servingsMultiplier,
    };
  }
  // Turning it off gives back an UNCOOKED entry when there is one: a night
  // already cooked is history, not a plan, and must not be deleted.
  const removable = siblings.filter((e) => e.cookedOn === null);
  const doomed = removable.length > 0 ? removable[removable.length - 1] : null;
  return doomed ? { action: "remove", entryId: doomed.id } : null;
}

export interface PoolGroup<T extends PoolEntry = PoolEntry> {
  recipeId: string;
  count: number;
  entries: T[];
}

// Groups same-recipe entries for the 🍱 ×N meal-prep badge (design.spec.md,
// Plan Mode / Screens table) while keeping each entry individually
// addressable (its own id, multiplier, cooked state).
export function groupPoolByRecipe<T extends PoolEntry>(entries: T[]): PoolGroup<T>[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const entry of entries) {
    if (!map.has(entry.recipeId)) {
      map.set(entry.recipeId, []);
      order.push(entry.recipeId);
    }
    map.get(entry.recipeId)!.push(entry);
  }
  return order.map((recipeId) => {
    const groupEntries = map.get(recipeId)!;
    return { recipeId, count: groupEntries.length, entries: groupEntries };
  });
}
