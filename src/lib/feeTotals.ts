// Fee-aware comparable totals (p5-03): turn per-store slot responses into
// a basket+fees total that ranks stores on what the household actually
// pays. Two fee philosophies exist side by side — Mathem bakes fulfilment
// into item prices (slots 9–49 kr), Axfood charges per slot (128–158 kr,
// split delivery+picking), Coop sits between — so item-sum ranking picks
// the wrong store. ICA publishes no fees pre-checkout: it stays honestly
// "unknown", never pseudo-comparable.
//
// The validate* functions double as the adapter-drift check (harness
// self-improvement rule): they run on every live response AND on the
// committed fixtures in `./harness check`, so when a store moves its API
// (Axfood did March→August 2026) the failure is a named field, not a
// silent 0-kr fee.

export interface FeeSlot {
  /** Fee for taking this slot, SEK. */
  total: number;
  /** Published split, when the store provides one (Axfood only so far). */
  delivery: number | null;
  picking: number | null;
}

export type DeliveryFees =
  | { kind: "slots"; cheapest: FeeSlot; min: number; max: number; count: number }
  | { kind: "unknown"; reason: string }
  | { kind: "none" };

export const unknownFees = (reason: string): DeliveryFees => ({ kind: "unknown", reason });

/** Cheapest-slot fees over a store's eligible slots (already filtered to
 * the wanted day/window — the comparable total is for a slot the
 * household would actually take). */
export function slotFees(slots: FeeSlot[]): DeliveryFees {
  if (slots.length === 0) return { kind: "none" };
  const cheapest = slots.reduce((a, b) => (b.total < a.total ? b : a));
  const totals = slots.map((s) => s.total);
  return {
    kind: "slots",
    cheapest,
    min: Math.min(...totals),
    max: Math.max(...totals),
    count: slots.length,
  };
}

/** Parse the stores' SEK spellings: "39 kr", "89:-", "158,00 kr". */
export function parseSek(raw: string): number {
  const m = raw.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) throw new Error(`not a SEK price: ${JSON.stringify(raw)}`);
  return Number(m[1].replace(",", "."));
}

// --- per-family slot shapes + drift validators ------------------------------

const shapeMoved = (family: string, field: string, hint: string): Error =>
  new Error(
    `${family} slot shape moved (${field} ${hint}) — update the adapter in compare/ and recapture src/lib/__fixtures__/store-slots/`,
  );

interface PriceEnvelope {
  value: number;
}

export interface AxfoodFeeFields {
  totalCost: PriceEnvelope;
  deliveryCost?: PriceEnvelope | null;
  pickingCost?: PriceEnvelope | null;
}

export function validateAxfoodSlots(slots: unknown): asserts slots is AxfoodFeeFields[] {
  if (!Array.isArray(slots)) throw shapeMoved("Axfood", "slots", "is not an array");
  for (const slot of slots) {
    const s = slot as AxfoodFeeFields;
    if (typeof s?.totalCost?.value !== "number") {
      throw shapeMoved("Axfood", "totalCost.value", "missing or not a number");
    }
  }
}

export const axfoodFeeSlot = (s: AxfoodFeeFields): FeeSlot => ({
  total: s.totalCost.value,
  delivery: s.deliveryCost?.value ?? null,
  picking: s.pickingCost?.value ?? null,
});

export interface CoopWindowFeeFields {
  cost: number;
}

export function validateCoopWindows(windows: unknown): asserts windows is CoopWindowFeeFields[] {
  if (!Array.isArray(windows)) throw shapeMoved("Coop", "timewindows", "is not an array");
  for (const win of windows) {
    if (typeof (win as CoopWindowFeeFields)?.cost !== "number") {
      throw shapeMoved("Coop", "cost", "missing or not a number");
    }
  }
}

export const coopFeeSlot = (w: CoopWindowFeeFields): FeeSlot => ({
  total: w.cost,
  delivery: null,
  picking: null,
});

export interface MathemSlotFeeFields {
  price: string;
}

export function validateMathemSlots(slots: unknown): asserts slots is MathemSlotFeeFields[] {
  if (!Array.isArray(slots)) throw shapeMoved("Mathem", "slots", "is not an array");
  for (const slot of slots) {
    if (typeof (slot as MathemSlotFeeFields)?.price !== "string") {
      throw shapeMoved("Mathem", "price", "missing or not a string");
    }
  }
}

export const mathemFeeSlot = (s: MathemSlotFeeFields): FeeSlot => ({
  total: parseSek(s.price),
  delivery: null,
  picking: null,
});

// --- comparable ranking -----------------------------------------------------

export interface ComparableEntry {
  store: string;
  /** Sum of matched item prices, SEK. */
  basket: number;
  fees: DeliveryFees;
}

export interface RankedStore extends ComparableEntry {
  /** basket + cheapest eligible slot fee; null when fees are unknown or
   * the store has no eligible slot. */
  comparable: number | null;
}

/**
 * Rank stores on what the household would actually pay: comparable total
 * where fees are known, basket alone (flagged unknown by `fees.kind`)
 * where the store hides fees until checkout, and last when there is no
 * eligible slot at all — a store that can't deliver can't win.
 */
export function rankByComparable(entries: ComparableEntry[]): RankedStore[] {
  const ranked = entries.map((e) => ({
    ...e,
    comparable:
      e.fees.kind === "slots" ? Number((e.basket + e.fees.cheapest.total).toFixed(2)) : null,
  }));
  const sortKey = (r: RankedStore): number =>
    r.fees.kind === "slots" ? r.comparable! : r.fees.kind === "unknown" ? r.basket : Infinity;
  return ranked.sort((a, b) => sortKey(a) - sortKey(b));
}
