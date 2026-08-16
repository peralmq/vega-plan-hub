// Fixture-driven tests for fee-aware comparable totals (p5-03). Slot
// fixtures are real (trimmed) responses captured 2026-08-16 for zip 11251:
// Axfood via the household logins, Coop anonymous, Mathem via the MCP.
import { describe, expect, it } from "vitest";

import {
  axfoodFeeSlot,
  coopFeeSlot,
  mathemFeeSlot,
  parseSek,
  rankByComparable,
  slotFees,
  unknownFees,
  validateAxfoodSlots,
  validateCoopWindows,
  validateMathemSlots,
  type FeeSlot,
} from "./feeTotals";
import coopSlots from "./__fixtures__/store-slots/coop.json";
import hemkopSlots from "./__fixtures__/store-slots/hemkop.json";
import mathemSlots from "./__fixtures__/store-slots/mathem.json";
import willysSlots from "./__fixtures__/store-slots/willys.json";

describe("parseSek", () => {
  it("reads the stores' three price spellings", () => {
    expect(parseSek("39 kr")).toBe(39);
    expect(parseSek("89:-")).toBe(89);
    expect(parseSek("158,00 kr")).toBe(158);
  });

  it("keeps Swedish decimals", () => {
    expect(parseSek("17,50 kr")).toBeCloseTo(17.5);
  });

  it("rejects non-prices instead of returning NaN", () => {
    expect(() => parseSek("gratis")).toThrow(/price/i);
  });
});

describe("fee extraction from real slot fixtures", () => {
  it("splits Axfood per-slot fees into delivery + picking", () => {
    validateAxfoodSlots(willysSlots);
    const fee = axfoodFeeSlot(willysSlots[0] as never);
    expect(fee.total).toBe(158);
    expect(fee.delivery).toBe(99);
    expect(fee.picking).toBe(59);
    expect(fee.delivery! + fee.picking!).toBe(fee.total);
  });

  it("sees the intra-Axfood fee gap: Hemköp cheaper than Willys on the same platform", () => {
    validateAxfoodSlots(hemkopSlots);
    const willys = axfoodFeeSlot(willysSlots[0] as never);
    const hemkop = axfoodFeeSlot(hemkopSlots[0] as never);
    expect(hemkop.total).toBeLessThan(willys.total);
  });

  it("reads Coop window costs (no split published)", () => {
    validateCoopWindows(coopSlots);
    const fee = coopFeeSlot(coopSlots[0] as never);
    expect(fee.total).toBeGreaterThan(0);
    expect(fee.delivery).toBeNull();
    expect(fee.picking).toBeNull();
  });

  it("parses Mathem's string slot prices", () => {
    validateMathemSlots(mathemSlots);
    const fees = (mathemSlots as unknown[]).map((s) => mathemFeeSlot(s as never));
    expect(fees.every((f) => Number.isFinite(f.total))).toBe(true);
    // Mathem bakes fulfilment into item prices; slot fees stay far below
    // Axfood's (9–49 kr observed vs 128–158) — the two fee philosophies.
    expect(Math.max(...fees.map((f) => f.total))).toBeLessThan(100);
  });
});

describe("drift validators (self-improvement: fail loudly when a shape moves)", () => {
  it("accepts every committed fixture", () => {
    expect(() => validateAxfoodSlots(willysSlots)).not.toThrow();
    expect(() => validateAxfoodSlots(hemkopSlots)).not.toThrow();
    expect(() => validateCoopWindows(coopSlots)).not.toThrow();
    expect(() => validateMathemSlots(mathemSlots)).not.toThrow();
  });

  it("names the moved field when Axfood drops the fee envelope", () => {
    const mutated = structuredClone(willysSlots) as Record<string, unknown>[];
    delete mutated[0].totalCost;
    expect(() => validateAxfoodSlots(mutated)).toThrow(/shape moved.*totalCost/i);
  });

  it("rejects a non-array response outright", () => {
    expect(() => validateCoopWindows({ windows: [] })).toThrow(/shape moved/i);
    expect(() => validateMathemSlots(null)).toThrow(/shape moved/i);
  });

  it("catches a re-typed price field", () => {
    const mutated = structuredClone(coopSlots) as Record<string, unknown>[];
    mutated[0].cost = "89:-"; // number → string would silently break totals
    expect(() => validateCoopWindows(mutated)).toThrow(/shape moved.*cost/i);
  });
});

describe("slotFees over a store's eligible slots", () => {
  const fees: FeeSlot[] = [
    { total: 89, delivery: null, picking: null },
    { total: 59, delivery: null, picking: null },
    { total: 79, delivery: null, picking: null },
  ];

  it("picks the cheapest slot and reports the range", () => {
    const f = slotFees(fees);
    expect(f).toEqual({ kind: "slots", cheapest: fees[1], min: 59, max: 89, count: 3 });
  });

  it("returns none for an empty slot list", () => {
    expect(slotFees([])).toEqual({ kind: "none" });
  });
});

describe("rankByComparable — the p5-01 gate's reason this plan exists", () => {
  // The live 2026-08-16 five-store run, basket totals + cheapest in-window
  // slot fees. Item-sum order: ICA, Coop, Willys, Mathem, Hemköp.
  const entries = [
    { store: "ica", basket: 57.15, fees: unknownFees("fees shown at checkout") },
    { store: "coop", basket: 68.65, fees: slotFees([{ total: 59, delivery: null, picking: null }]) },
    { store: "willys", basket: 69.1, fees: slotFees([{ total: 158, delivery: 99, picking: 59 }]) },
    { store: "mathem", basket: 76.07, fees: slotFees([{ total: 9, delivery: null, picking: null }]) },
    { store: "hemkop", basket: 102.95, fees: slotFees([{ total: 128, delivery: 79, picking: 49 }]) },
  ];

  it("computes basket + cheapest slot fee where fees are known", () => {
    const ranked = rankByComparable(entries);
    const mathem = ranked.find((r) => r.store === "mathem")!;
    expect(mathem.comparable).toBeCloseTo(85.07);
  });

  it("leaves unknown-fee stores without a comparable total", () => {
    const ica = rankByComparable(entries).find((r) => r.store === "ica")!;
    expect(ica.comparable).toBeNull();
  });

  it("flips the ranking vs item-sum: Mathem's cheap slots beat Willys' 158 kr fee", () => {
    const order = rankByComparable(entries).map((r) => r.store);
    // Mathem (4th by item sum) wins among fee-known stores; Willys (3rd by
    // item sum) drops behind Coop. ICA sorts on basket alone, flagged unknown.
    expect(order.indexOf("mathem")).toBeLessThan(order.indexOf("coop"));
    expect(order.indexOf("coop")).toBeLessThan(order.indexOf("willys"));
    expect(order.indexOf("willys")).toBeLessThan(order.indexOf("hemkop"));
  });

  it("ranks a no-slot store last among known outcomes", () => {
    const ranked = rankByComparable([
      { store: "a", basket: 10, fees: { kind: "none" } },
      { store: "b", basket: 99, fees: slotFees([{ total: 1, delivery: null, picking: null }]) },
    ]);
    expect(ranked.map((r) => r.store)).toEqual(["b", "a"]);
  });
});
