// Fixture-driven tests for the store-comparison core. Fixtures are real
// (trimmed) API responses captured 2026-08-16 — mathem/willys/hemkop via
// anonymous search, ICA via the household's default store (Maxi ICA
// Stormarknad Lindhagen, account 1003418) through a browser session.
import { describe, expect, it } from "vitest";

import {
  buildComparison,
  cartPlan,
  extractAxfood,
  extractIca,
  extractMathem,
  matchQuality,
  pickBest,
  type StoreProduct,
} from "./storeCompare";
import hemkopFixture from "./__fixtures__/store-search/hemkop.json";
import icaFixture from "./__fixtures__/store-search/ica.json";
import mathemFixture from "./__fixtures__/store-search/mathem.json";
import willysFixture from "./__fixtures__/store-search/willys.json";

const TERMS = ["havremjölk", "krossade tomater", "pasta penne", "gul lök", "kikärtor"];

type FixtureMap = Record<string, unknown[]>;

const extractAll = (
  fixture: FixtureMap,
  extract: (products: never[]) => StoreProduct[],
): Record<string, StoreProduct[]> =>
  Object.fromEntries(Object.entries(fixture).map(([term, raw]) => [term, extract(raw as never[])]));

describe("extraction", () => {
  it("maps Mathem raw products to SEK numbers and ids", () => {
    const products = extractMathem(mathemFixture["havremjölk"] as never[]);
    expect(products[0].name).toContain("Havredryck");
    expect(products[0].price).toBeGreaterThan(5);
    expect(products[0].price).toBeLessThan(100);
    expect(products.every((p) => typeof p.id === "string" && p.id.length > 0)).toBe(true);
  });

  it("parses Axfood Swedish decimal compare-prices", () => {
    const products = extractAxfood(willysFixture["havremjölk"] as never[]);
    const withCompare = products.find((p) => p.comparePrice !== null);
    expect(withCompare).toBeDefined();
    expect(Number.isFinite(withCompare!.comparePrice)).toBe(true);
  });

  it("maps ICA price envelopes to numbers", () => {
    const products = extractIca(icaFixture["havremjölk"] as never[]);
    expect(products[0].price).toBeCloseTo(17.93);
    expect(products.every((p) => p.available)).toBe(true);
  });
});

describe("matchQuality", () => {
  it("accepts compound product names covering the term", () => {
    expect(matchQuality("krossade tomater", "Finkrossade Tomater Polpa 400g Mutti")).toBe("good");
  });

  it("never lets a shorter product token claim a longer term token", () => {
    // The real Hemköp trap: "havremjölk" must not silently match "Havremjöl".
    expect(matchQuality("havremjölk", "Havremjöl")).not.toBe("good");
  });

  it("is diacritic-insensitive", () => {
    expect(matchQuality("gul lok", "Gul lök 1kg Klass 1 ICA")).toBe("good");
  });
});

describe("pickBest on real fixtures", () => {
  it("finds an oat drink for havremjölk at every store that stocks one", () => {
    // Stores legally rename plant milk to "havredryck", so these resolve
    // through the relevance fallback and must be flagged weak, not good.
    for (const [fixture, extract] of [
      [mathemFixture, extractMathem],
      [willysFixture, extractAxfood],
      [icaFixture, extractIca],
    ] as const) {
      const match = pickBest("havremjölk", extract(fixture["havremjölk"] as never[]));
      expect(match.product).not.toBeNull();
      expect(match.product!.name.toLowerCase()).toMatch(/havredr|havremj|ikaffe/);
      expect(match.quality).toBe("weak");
    }
  });

  it("flags Hemköp's oat-flour-for-oat-milk result instead of silently accepting it", () => {
    const match = pickBest("havremjölk", extractAxfood(hemkopFixture["havremjölk"] as never[]));
    expect(match.quality).not.toBe("good");
  });

  it("skips unavailable products", () => {
    const products: StoreProduct[] = [
      { id: "1", name: "Kikärtor 380g", brand: null, price: 5, comparePrice: null, compareUnit: null, available: false },
      { id: "2", name: "Kikärtor 500g", brand: null, price: 9, comparePrice: null, compareUnit: null, available: true },
    ];
    expect(pickBest("kikärtor", products).product!.id).toBe("2");
  });
});

describe("buildComparison", () => {
  it("totals only matched items and reports unmatched terms", () => {
    const byTerm = extractAll(mathemFixture as FixtureMap, extractMathem);
    byTerm["saffran"] = []; // a term the fixture never searched
    const cmp = buildComparison("mathem", [...TERMS, "saffran"], byTerm);
    expect(cmp.matched).toBe(TERMS.length);
    expect(cmp.unmatched).toEqual(["saffran"]);
    const manualTotal = cmp.items.reduce((s, i) => s + (i.product?.price ?? 0), 0);
    expect(cmp.total).toBeCloseTo(manualTotal, 2);
    expect(cmp.total).toBeGreaterThan(0);
  });

  it("plans one cart-add per matched term and skips unmatched terms", () => {
    const byTerm = extractAll(mathemFixture as FixtureMap, extractMathem);
    byTerm["saffran"] = []; // no product → must land in skipped, never in ops
    const plan = cartPlan(buildComparison("mathem", [...TERMS, "saffran"], byTerm));
    expect(plan.ops).toHaveLength(TERMS.length);
    expect(plan.skipped).toEqual(["saffran"]);
    expect(plan.ops.every((o) => o.quantity === 1)).toBe(true);
    // manipulate_cart takes integer product ids — Mathem ids must be numeric.
    expect(plan.ops.every((o) => /^\d+$/.test(o.productId))).toBe(true);
  });

  it("keeps weak matches in the cart plan (human reviews in store UI) but counts them", () => {
    const plan = cartPlan(
      buildComparison("mathem", TERMS, extractAll(mathemFixture as FixtureMap, extractMathem)),
    );
    const havre = plan.ops.find((o) => o.term === "havremjölk");
    expect(havre).toBeDefined();
    expect(havre!.quality).toBe("weak");
    expect(plan.weak).toBeGreaterThanOrEqual(1);
  });

  it("produces a full five-store comparison from fixtures with every store matching most terms", () => {
    const stores = [
      buildComparison("mathem", TERMS, extractAll(mathemFixture as FixtureMap, extractMathem)),
      buildComparison("willys", TERMS, extractAll(willysFixture as FixtureMap, extractAxfood)),
      buildComparison("hemkop", TERMS, extractAll(hemkopFixture as FixtureMap, extractAxfood)),
      buildComparison("ica", TERMS, extractAll(icaFixture as FixtureMap, extractIca)),
    ];
    for (const cmp of stores) {
      expect(cmp.matched + cmp.unmatched.length).toBe(TERMS.length);
      expect(cmp.matched).toBeGreaterThanOrEqual(TERMS.length - 1);
    }
  });
});
