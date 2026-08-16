// Fixture-driven tests for the store-comparison core. Fixtures are real
// (trimmed) API responses captured 2026-08-16 — mathem/willys/hemkop via
// anonymous search, ICA via the household's default store (Maxi ICA
// Stormarknad Lindhagen, account 1003418) through a browser session.
import { describe, expect, it } from "vitest";

import {
  buildComparison,
  cartPlan,
  extractAxfood,
  extractCoop,
  extractIca,
  extractMathem,
  extractMathemMcp,
  matchQuality,
  pickBest,
  type StoreProduct,
} from "./storeCompare";
import {
  commonProductsFromMathemOrders,
  commonProductsFromOrders,
  mergeSeeds,
  validateAxfoodOrders,
  validateMathemOrders,
} from "./storeCompare";
import axfoodOrders from "./__fixtures__/axfood-orders.json";
import mathemOrders from "./__fixtures__/mathem-orders.json";
import coopFixture from "./__fixtures__/store-search/coop.json";
import hemkopFixture from "./__fixtures__/store-search/hemkop.json";
import icaFixture from "./__fixtures__/store-search/ica.json";
import likelyFixture from "./__fixtures__/mathem-likely-to-buy.json";
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

  it("maps Coop b2c price envelopes and EAN ids", () => {
    const products = extractCoop(coopFixture["kikärtor"] as never[]);
    expect(products.length).toBeGreaterThan(0);
    expect(products[0].name).toMatch(/kikärtor/i);
    expect(products.every((p) => Number.isFinite(p.price) && p.price > 0)).toBe(true);
    expect(products.every((p) => /^\d+$/.test(p.id))).toBe(true);
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

  it("flags Coop's query-corrected havremjöl results the same way", () => {
    // Coop's search itself corrects "havremjölk" → "havremjöl" (queryUsed
    // in the raw response) and returns only oat flour — must stay weak.
    const match = pickBest("havremjölk", extractCoop(coopFixture["havremjölk"] as never[]));
    expect(match.product).not.toBeNull();
    expect(match.quality).toBe("weak");
  });

  it("skips unavailable products", () => {
    const products: StoreProduct[] = [
      { id: "1", name: "Kikärtor 380g", brand: null, price: 5, comparePrice: null, compareUnit: null, available: false },
      { id: "2", name: "Kikärtor 500g", brand: null, price: 9, comparePrice: null, compareUnit: null, available: true },
    ];
    expect(pickBest("kikärtor", products).product!.id).toBe("2");
  });
});

describe("seeding from household staples (likely_to_buy)", () => {
  // Trimmed real likely_to_buy capture, 2026-08-16: the household's
  // actual staples, incl. "Lök Gul Påse" and "Oatly Havredryck Choklad".
  const seeds = extractMathemMcp(likelyFixture as never[]);

  it("maps the MCP product shape (flat strings, numeric ids)", () => {
    expect(seeds.length).toBeGreaterThanOrEqual(5);
    expect(seeds.every((s) => /^\d+$/.test(s.id))).toBe(true);
    expect(seeds.every((s) => Number.isFinite(s.price) && s.price > 0)).toBe(true);
    expect(seeds.every((s) => s.available)).toBe(true);
  });

  it("pins a fully-covering staple over search relevance", () => {
    const products = extractMathem(mathemFixture["gul lök"] as never[]);
    const match = pickBest("gul lök", products, seeds);
    // Search's top hit is the single onion (3,95); the household buys the bag.
    expect(match.product!.name).toBe("Lök Gul Påse Klass1 Sverige");
    expect(match.seeded).toBe(true);
    expect(match.quality).toBe("good");
  });

  it("never pins a weak seed — chocolate oat milk must not hijack havremjölk", () => {
    // The household really buys "Oatly Havredryck Choklad 1,5%", but it only
    // weakly matches "havremjölk"; store relevance must win instead.
    const products = extractMathem(mathemFixture["havremjölk"] as never[]);
    const match = pickBest("havremjölk", products, seeds);
    expect(match.seeded).toBe(false);
    expect(match.product!.name).not.toMatch(/choklad/i);
    expect(match.quality).toBe("weak");
  });

  it("threads seeds through buildComparison and leaves unrelated terms alone", () => {
    const byTerm = extractAll(mathemFixture as FixtureMap, extractMathem);
    const cmp = buildComparison("mathem", TERMS, byTerm, seeds);
    const seededTerms = cmp.items.filter((i) => i.seeded).map((i) => i.term);
    expect(seededTerms).toEqual(["gul lök"]);
    expect(cmp.matched).toBe(TERMS.length);
  });
});

describe("Axfood purchase-history seeds (p5-04)", () => {
  // Real (scrubbed) Willys order history, 3 orders, captured 2026-08-16:
  // only product-level fields — customer/address fields never leave the API.
  it("accepts the committed order fixture and names a moved field on drift", () => {
    expect(() => validateAxfoodOrders(axfoodOrders)).not.toThrow();
    const mutated = structuredClone(axfoodOrders) as {
      categoryOrderedDeliveredProducts: Record<string, { priceValue: unknown }[]>;
    }[];
    Object.values(mutated[0].categoryOrderedDeliveredProducts)[0][0].priceValue = "36,90";
    expect(() => validateAxfoodOrders(mutated)).toThrow(/shape moved.*priceValue/i);
    expect(() => validateAxfoodOrders({ orders: [] })).toThrow(/shape moved/i);
  });

  it("dedupes by product code and ranks by how often the household bought it", () => {
    const common = commonProductsFromOrders(axfoodOrders as never[]);
    const codes = common.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    // Bought in every one of the 3 orders → must rank ahead of one-offs.
    const everyOrder = common.findIndex((p) => p.name === "Ikaffe Barista Edition Havredryck");
    expect(everyOrder).toBeGreaterThanOrEqual(0);
    expect(everyOrder).toBeLessThan(10);
  });

  it("pins a fully-covering history staple via the existing seed layer", () => {
    const seeds = extractAxfood(commonProductsFromOrders(axfoodOrders as never[]) as never[]);
    const fromSearch: StoreProduct[] = [
      { id: "x", name: "Spenat Krossad Fryst", brand: null, price: 12, comparePrice: null, compareUnit: null, available: true },
    ];
    const match = pickBest("spenat", fromSearch, seeds);
    expect(match.seeded).toBe(true);
    expect(match.product!.name).toBe("Spenat Klass 1");
  });

  it("prices a pinned seed from today's search result, not the old order line", () => {
    const seeds: StoreProduct[] = [
      { id: "100", name: "Spenat Klass 1", brand: null, price: 22.9, comparePrice: null, compareUnit: null, available: true },
    ];
    const fromSearch: StoreProduct[] = [
      { id: "100", name: "Spenat Klass 1", brand: null, price: 24.9, comparePrice: null, compareUnit: null, available: true },
    ];
    const match = pickBest("spenat", fromSearch, seeds);
    expect(match.seeded).toBe(true);
    expect(match.product!.price).toBe(24.9);
  });

  it("never lets a history product weakly hijack a term (existing invariant)", () => {
    const seeds = extractAxfood(commonProductsFromOrders(axfoodOrders as never[]) as never[]);
    const match = pickBest("havremjölk", extractAxfood(willysFixture["havremjölk"] as never[]), seeds);
    // The household buys "Ikaffe Barista Edition Havredryck" every order,
    // but it does not cover "havremjölk" — store relevance must win.
    expect(match.seeded).toBe(false);
  });
});

describe("Mathem purchase-history seeds (p5-04)", () => {
  // Real (scrubbed) Mathem get_orders capture, 3 orders, 2026-08-16.
  it("accepts the committed fixture and names a moved field on drift", () => {
    expect(() => validateMathemOrders(mathemOrders)).not.toThrow();
    const mutated = structuredClone(mathemOrders) as {
      products: { product: { price: unknown } }[];
    }[];
    mutated[0].products[0].product.price = 24.95; // string → number drift
    expect(() => validateMathemOrders(mutated)).toThrow(/shape moved.*price/i);
    expect(() => validateMathemOrders({ orders: [] })).toThrow(/shape moved/i);
  });

  it("dedupes by id and ranks the household's every-order staples first", () => {
    const common = commonProductsFromMathemOrders(mathemOrders as never[]);
    const ids = common.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const tofu = common.findIndex((p) => p.name.startsWith("Yipin Tofu"));
    expect(tofu).toBeGreaterThanOrEqual(0);
    expect(tofu).toBeLessThan(15);
  });

  it("merges history with likely_to_buy, history first, deduped by id", () => {
    const history = extractMathemMcp(commonProductsFromMathemOrders(mathemOrders as never[]));
    const likely = extractMathemMcp(likelyFixture as never[]);
    const merged = mergeSeeds(history, likely);
    expect(merged.slice(0, history.length)).toEqual(history);
    expect(new Set(merged.map((s) => s.id)).size).toBe(merged.length);
    // Every likely_to_buy staple not already in history must survive.
    for (const s of likely) {
      expect(merged.some((m) => m.id === s.id)).toBe(true);
    }
  });

  it("pins a real Mathem staple through the seed layer", () => {
    const seeds = extractMathemMcp(commonProductsFromMathemOrders(mathemOrders as never[]));
    const fromSearch: StoreProduct[] = [
      { id: "999", name: "Tofu Marinerad", brand: null, price: 30, comparePrice: null, compareUnit: null, available: true },
    ];
    const match = pickBest("tofu naturell", fromSearch, seeds);
    expect(match.seeded).toBe(true);
    expect(match.product!.name).toMatch(/Tofu Naturell/);
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
      buildComparison("coop", TERMS, extractAll(coopFixture as FixtureMap, extractCoop)),
    ];
    for (const cmp of stores) {
      expect(cmp.matched + cmp.unmatched.length).toBe(TERMS.length);
      expect(cmp.matched).toBeGreaterThanOrEqual(TERMS.length - 1);
    }
  });
});
