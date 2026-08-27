// p5-05: fixture tests for the pure batch → compare-list mapping. No
// network — Supabase fetch/sign-in (batchFetch.ts) is evidence-only, same
// split as storeCompare.ts/stores.ts for the --list path.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseListEntries } from "@/lib/storeRotation";
import {
  batchRowsToCompareList,
  formatQuantity,
  pickLatestBatch,
  storeAffinityFromProductName,
  type PlanBatchRow,
  type ProductPreferenceRow,
  type ShoppingListItemRow,
} from "./batchMap";

const item = (over: Partial<ShoppingListItemRow>): ShoppingListItemRow => ({
  canonical_ingredient: null,
  display_name: "item",
  quantity: null,
  unit: null,
  checked_at: null,
  ...over,
});

const pref = (over: Partial<ProductPreferenceRow>): ProductPreferenceRow => ({
  canonical_ingredient: "",
  product_name: "",
  superseded_by: null,
  valid_from: "2026-01-01T00:00:00Z",
  ...over,
});

describe("storeAffinityFromProductName", () => {
  it("infers a store from its own brand token in the preferred product name", () => {
    expect(storeAffinityFromProductName("ICA Havredryck")).toEqual(["ica"]);
    expect(storeAffinityFromProductName("Coop Änglamark Kikärtor")).toEqual(["coop"]);
    expect(storeAffinityFromProductName("Willys Eget Pasta")).toEqual(["willys"]);
    expect(storeAffinityFromProductName("Mathem Krossade Tomater")).toEqual(["mathem"]);
  });

  it("folds Swedish diacritics so Hemköp matches the hemkop store key", () => {
    expect(storeAffinityFromProductName("Hemköp Kikärtor")).toEqual(["hemkop"]);
  });

  it("returns null (unrestricted) when no store brand token is present", () => {
    expect(storeAffinityFromProductName("Oatly Havredryck Deluxe")).toBeNull();
    expect(storeAffinityFromProductName("Penne")).toBeNull();
  });

  it("never false-positives on a store name embedded in a longer word", () => {
    expect(storeAffinityFromProductName("Icakupong presentkort")).toBeNull();
    expect(storeAffinityFromProductName("Coophallen lokalvaror")).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("combines quantity + unit", () => {
    expect(formatQuantity(1000, "g")).toBe("1000 g");
  });
  it("omits the unit when absent", () => {
    expect(formatQuantity(3, null)).toBe("3");
  });
  it("is null when there's no quantity at all", () => {
    expect(formatQuantity(null, "g")).toBeNull();
  });
});

describe("pickLatestBatch", () => {
  it("picks the batch with the greatest locked_at", () => {
    const batches: PlanBatchRow[] = [
      { id: "b1", locked_at: "2026-08-20T10:00:00Z" },
      { id: "b3", locked_at: "2026-08-25T09:00:00Z" },
      { id: "b2", locked_at: "2026-08-22T18:00:00Z" },
    ];
    expect(pickLatestBatch(batches)).toBe("b3");
  });

  it("is null for an empty batch list", () => {
    expect(pickLatestBatch([])).toBeNull();
  });
});

describe("batchRowsToCompareList", () => {
  it("is empty for an empty batch", () => {
    expect(batchRowsToCompareList([], [])).toEqual([]);
  });

  it("excludes already-checked rows (they're bought)", () => {
    const items = [
      item({ display_name: "pasta", checked_at: null }),
      item({ display_name: "kikärtor", checked_at: "2026-08-26T12:00:00Z" }),
    ];
    const out = batchRowsToCompareList(items, []);
    expect(out.map((e) => e.item.term)).toEqual(["pasta"]);
  });

  it("maps a preferred product's store brand to an affinity", () => {
    const items = [item({ canonical_ingredient: "mjölk", display_name: "havremjölk" })];
    const preferences = [pref({ canonical_ingredient: "mjölk", product_name: "ICA Havredryck" })];
    const out = batchRowsToCompareList(items, preferences);
    expect(out).toEqual([{ item: { term: "havremjölk", stores: ["ica"] }, annotation: null }]);
  });

  it("leaves stores null (unrestricted) for a row with no matching preference", () => {
    const items = [item({ canonical_ingredient: "vitlök", display_name: "vitlök" })];
    const out = batchRowsToCompareList(items, [pref({ canonical_ingredient: "mjölk", product_name: "ICA Havredryck" })]);
    expect(out).toEqual([{ item: { term: "vitlök", stores: null }, annotation: null }]);
  });

  it("leaves stores null when the preferred product has no store brand token", () => {
    const items = [item({ canonical_ingredient: "pasta", display_name: "pasta penne" })];
    const preferences = [pref({ canonical_ingredient: "pasta", product_name: "Penne" })];
    const out = batchRowsToCompareList(items, preferences);
    expect(out[0].item.stores).toBeNull();
  });

  it("ignores a superseded (non-current) preference row", () => {
    const items = [item({ canonical_ingredient: "mjölk", display_name: "havremjölk" })];
    const preferences = [
      pref({ canonical_ingredient: "mjölk", product_name: "ICA Havredryck", superseded_by: "next" }),
    ];
    const out = batchRowsToCompareList(items, preferences);
    expect(out[0].item.stores).toBeNull();
  });

  it("falls back to display_name for preference lookup on an ad-hoc row (no canonical_ingredient)", () => {
    const items = [item({ canonical_ingredient: null, display_name: "kikärtor" })];
    const preferences = [pref({ canonical_ingredient: "kikärtor", product_name: "Coop Kikärtor" })];
    const out = batchRowsToCompareList(items, preferences);
    expect(out[0].item.stores).toEqual(["coop"]);
  });

  it("carries the quantity + unit as a printable annotation, never into the item itself", () => {
    const items = [item({ display_name: "krossade tomater", quantity: 800, unit: "g" })];
    const out = batchRowsToCompareList(items, []);
    expect(out).toEqual([
      { item: { term: "krossade tomater", stores: null }, annotation: "800 g" },
    ]);
  });

  // Verification's "Dry" bullet, at the fixture level (no live Supabase
  // batch exists in this checkout): a batch whose rows mirror
  // fixtures/compare-list.json — no preferences on file, so no affinity —
  // maps to the identical {term, stores} list a hand-written --list run
  // of that file would use.
  it("matches the --list output for the equivalent hand-written list", () => {
    const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "compare-list.json");
    const terms = JSON.parse(readFileSync(fixturePath, "utf8")) as string[];
    const handWritten = parseListEntries(terms);

    const items: ShoppingListItemRow[] = terms.map((term) =>
      item({ canonical_ingredient: term, display_name: term }),
    );
    const mapped = batchRowsToCompareList(items, []).map((e) => e.item);
    expect(mapped).toEqual(handWritten);
  });
});
