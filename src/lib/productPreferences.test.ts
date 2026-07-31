import { describe, it, expect } from "vitest";
import { currentPreferenceMap, applyPreferredNames } from "./productPreferences";

const rows = [
  {
    canonical_ingredient: "mjölk",
    product_name: "Oatly Havredryck Deluxe",
    superseded_by: "pref-2",
    valid_from: "2026-03-01T00:00:00Z",
  },
  {
    canonical_ingredient: "mjölk",
    product_name: "ICA Havredryck",
    superseded_by: null,
    valid_from: "2026-07-20T00:00:00Z",
  },
  {
    canonical_ingredient: "pasta",
    product_name: "Penne",
    superseded_by: null,
    valid_from: "2026-06-01T00:00:00Z",
  },
];

describe("currentPreferenceMap", () => {
  it("keeps only non-superseded rows, keyed case-insensitively", () => {
    const map = currentPreferenceMap(rows);
    expect(map.get("mjölk")).toBe("ICA Havredryck");
    expect(map.get("pasta")).toBe("Penne");
    expect(map.size).toBe(2);
  });
  it("resolves duplicate current rows by latest valid_from", () => {
    const map = currentPreferenceMap([
      ...rows,
      {
        canonical_ingredient: "pasta",
        product_name: "Spaghetti",
        superseded_by: null,
        valid_from: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(map.get("pasta")).toBe("Penne");
  });
});

describe("applyPreferredNames", () => {
  it("swaps displayName for the preferred product, leaving the rest alone", () => {
    const items = [
      { displayName: "Mjölk", quantity: 1000 },
      { displayName: "vitlök", quantity: 3 },
    ];
    const out = applyPreferredNames(items, currentPreferenceMap(rows));
    expect(out[0].displayName).toBe("ICA Havredryck");
    expect(out[0].quantity).toBe(1000);
    expect(out[1].displayName).toBe("vitlök");
  });
  it("is a no-op with no preferences (the table ships empty)", () => {
    const items = [{ displayName: "mjölk" }];
    expect(applyPreferredNames(items, currentPreferenceMap([]))).toEqual(items);
  });
});
