// Store affinity + rotation (p5-02): some items the household wants are
// only carried (or only acceptable) at a subset of stores, so a single
// cheapest-basket winner fails week over week. Affinity restricts where
// an item may be sourced; rotation picks a primary store per run and
// alternates among tied stores so the same one doesn't win every week.
// Pure logic — the CLI supplies candidates (fee-aware ranking order from
// feeTotals) and persists history; everything here is deterministic.

export interface ListItem {
  term: string;
  /** The only stores this item may be sourced from; null = any store. */
  stores: string[] | null;
}

/** Rotation memory: per affinity term, the store that got the last run. */
export type RotationHistory = Record<string, { store: string; date: string }>;

export interface PrimaryCandidate {
  store: string;
  /** Position in the fee-aware comparable ranking (0 = cheapest). */
  rank: number;
  /** False when the store has no eligible slot for the wanted day/window. */
  deliverable: boolean;
}

export interface RotationSuggestion {
  primary: string | null;
  /** Items the primary may supply (its basket size under affinity). */
  coverage: number;
  /** Affinity items moving to the primary away from last run's store. */
  rotations: { term: string; from: string; date: string }[];
  /** Affinity items the primary may NOT supply — the human shops these
   * separately (no automatic multi-store splitting, per non-goal). */
  unsourced: string[];
}

/** Parse list-file entries: "term", {name}, or {name, stores: [...]}.
 * Store names are folded to lowercase (CLI store keys). An explicit empty
 * stores list is a mistake, not "nowhere" — reject it loudly. */
export function parseListEntries(raw: unknown[]): ListItem[] {
  return raw.map((entry) => {
    if (typeof entry === "string") return { term: entry, stores: null };
    const { name, stores } = entry as { name: string; stores?: string[] };
    if (stores !== undefined && stores.length === 0) {
      throw new Error(`"${name}": empty affinity list — omit stores to allow any store`);
    }
    return { term: name, stores: stores?.map((s) => s.toLowerCase()) ?? null };
  });
}

const allows = (item: ListItem, store: string): boolean =>
  item.stores === null || item.stores.includes(store);

/** The terms a store may supply under the list's affinities. */
export const allowedTerms = (items: ListItem[], store: string): string[] =>
  items.filter((i) => allows(i, store)).map((i) => i.term);

/**
 * Pick this run's primary store: best affinity coverage first, then
 * deliverability, then rotation (fewest affinity items that already went
 * to this store last run — spread the affinity purchases around), then
 * the fee-aware comparable rank. The suggestion is advisory: the human
 * records the store that actually got the order.
 */
export function suggestPrimary(
  candidates: PrimaryCandidate[],
  items: ListItem[],
  history: RotationHistory,
): RotationSuggestion {
  if (candidates.length === 0) return { primary: null, coverage: 0, rotations: [], unsourced: [] };

  const affinityItems = items.filter((i) => i.stores !== null);
  const coverage = (store: string): number => allowedTerms(items, store).length;
  const rotationPenalty = (store: string): number =>
    affinityItems.filter((i) => allows(i, store) && history[i.term]?.store === store).length;

  const maxCoverage = Math.max(...candidates.map((c) => coverage(c.store)));
  let pool = candidates.filter((c) => coverage(c.store) === maxCoverage);
  const deliverable = pool.filter((c) => c.deliverable);
  if (deliverable.length > 0) pool = deliverable;
  const best = pool.reduce((a, b) => {
    const byPenalty = rotationPenalty(a.store) - rotationPenalty(b.store);
    if (byPenalty !== 0) return byPenalty < 0 ? a : b;
    return a.rank <= b.rank ? a : b;
  });

  return {
    primary: best.store,
    coverage: maxCoverage,
    rotations: affinityItems
      .filter((i) => allows(i, best.store))
      .flatMap((i) => {
        const last = history[i.term];
        return last && last.store !== best.store
          ? [{ term: i.term, from: last.store, date: last.date }]
          : [];
      }),
    unsourced: affinityItems.filter((i) => !allows(i, best.store)).map((i) => i.term),
  };
}
