// Pure logic for the p5-01 store-comparison CLI (compare/): response
// extraction, ingredient→product matching, and comparison assembly.
// Network I/O lives in compare/; everything here is deterministic and
// fixture-tested on every `./harness check`. Raw shapes come from the
// stores' private APIs (see docs/research/store-integration-landscape.md)
// — extraction is defensive because those shapes are unversioned.

export interface StoreProduct {
  /** Store-native id usable for a later cart/list add. */
  id: string;
  name: string;
  brand: string | null;
  /** Item price in SEK. */
  price: number;
  /** Compare-price in SEK per compareUnit, when the store provides it. */
  comparePrice: number | null;
  compareUnit: string | null;
  available: boolean;
}

export type MatchQuality = "good" | "weak" | "none";

export interface ItemMatch {
  term: string;
  product: StoreProduct | null;
  quality: MatchQuality;
  /** Other candidate products the term surfaced (for a human to swap in). */
  alternatives: number;
}

export interface StoreComparison {
  store: string;
  items: ItemMatch[];
  /** Sum of matched item prices in SEK (weak matches included, flagged). */
  total: number;
  matched: number;
  weak: number;
  unmatched: string[];
}

// --- raw-response extraction (one per API family) --------------------------

interface MathemRawProduct {
  id: number | string;
  full_name: string;
  brand?: string | null;
  gross_price: string;
  gross_unit_price?: string | null;
  unit_price_quantity_abbreviation?: string | null;
  availability?: { is_available?: boolean } | null;
}

export function extractMathem(products: MathemRawProduct[]): StoreProduct[] {
  return products.map((p) => ({
    id: String(p.id),
    name: p.full_name,
    brand: p.brand ?? null,
    price: Number(p.gross_price),
    comparePrice: p.gross_unit_price != null ? Number(p.gross_unit_price) : null,
    compareUnit: p.unit_price_quantity_abbreviation ?? null,
    available: p.availability?.is_available !== false,
  }));
}

interface AxfoodRawProduct {
  code: string;
  name: string;
  manufacturer?: string | null;
  priceValue: number;
  comparePrice?: string | null; // "17,50 kr"
  comparePriceUnit?: string | null;
  outOfStock?: boolean;
  online?: boolean;
}

export function extractAxfood(products: AxfoodRawProduct[]): StoreProduct[] {
  return products.map((p) => ({
    id: p.code,
    name: p.name,
    brand: p.manufacturer ?? null,
    price: p.priceValue,
    comparePrice: p.comparePrice
      ? Number(p.comparePrice.replace(/[^\d,.]/g, "").replace(",", "."))
      : null,
    compareUnit: p.comparePriceUnit ?? null,
    available: p.outOfStock !== true && p.online !== false,
  }));
}

interface IcaRawProduct {
  productId: string;
  retailerProductId?: string;
  name: string;
  brand?: string | null;
  price: { amount: string };
  unitPrice?: { price?: { amount?: string }; unitName?: string } | null;
  available?: boolean;
}

export function extractIca(products: IcaRawProduct[]): StoreProduct[] {
  return products.map((p) => ({
    id: p.productId,
    name: p.name,
    brand: p.brand ?? null,
    price: Number(p.price.amount),
    comparePrice:
      p.unitPrice?.price?.amount != null ? Number(p.unitPrice.price.amount) : null,
    compareUnit: p.unitPrice?.unitName ?? null,
    available: p.available !== false,
  }));
}

// --- matching ---------------------------------------------------------------

// Fold to lowercase ASCII-ish so "lök"/"lok" and composed/decomposed forms
// compare equal; store search already handles synonyms, we only guard
// against relevance drift (e.g. Hemköp returning "Havremjöl" for
// "havremjölk").
const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-̏]/g, "");

const tokens = (s: string): string[] => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * A term token counts as covered when some product-name token contains it
 * (compound-friendly: "tomater" covers "krosstomater"). Never the reverse —
 * a shorter product token ("havremjöl") must not claim the longer term
 * token ("havremjölk").
 */
export function matchQuality(term: string, productName: string): MatchQuality {
  const t = tokens(term);
  const p = tokens(productName);
  if (t.length === 0 || p.length === 0) return "none";
  const covered = t.filter((tt) => p.some((pt) => pt.includes(tt))).length;
  if (covered === t.length) return "good";
  return covered > 0 ? "weak" : "none";
}

/**
 * Pick the store's best offer for a term: available products only, best
 * match quality first, then the store's own relevance order. When no name
 * covers the term (stores legally rename e.g. "havremjölk" → "Havredryck")
 * we trust the store's top relevance hit but flag it "weak" so a human
 * reviews it. Product is null only when the store returned nothing usable.
 */
export function pickBest(term: string, products: StoreProduct[]): ItemMatch {
  const available = products.filter((p) => p.available);
  const scored = available.map((product) => ({
    product,
    quality: matchQuality(term, product.name),
  }));
  const good = scored.filter((s) => s.quality === "good");
  const partial = scored.filter((s) => s.quality === "weak");
  const chosen =
    good[0] ??
    partial[0] ??
    (scored[0] ? { product: scored[0].product, quality: "weak" as const } : null);
  return {
    term,
    product: chosen?.product ?? null,
    quality: chosen?.quality ?? "none",
    alternatives: Math.max(0, available.length - 1),
  };
}

export function buildComparison(
  store: string,
  terms: string[],
  productsByTerm: Record<string, StoreProduct[]>,
): StoreComparison {
  const items = terms.map((term) => pickBest(term, productsByTerm[term] ?? []));
  const matchedItems = items.filter((i) => i.product !== null);
  return {
    store,
    items,
    total: Number(matchedItems.reduce((sum, i) => sum + (i.product?.price ?? 0), 0).toFixed(2)),
    matched: matchedItems.length,
    weak: items.filter((i) => i.quality === "weak").length,
    unmatched: items.filter((i) => i.product === null).map((i) => i.term),
  };
}
