import { describe, it, expect } from "vitest";
import {
  currentPreferenceMap,
  applyPreferredNames,
  findCurrentRow,
  planSupersede,
  planUndo,
  formatSinceMonth,
  formatSinceDate,
  type PreferenceRow,
} from "./productPreferences";

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

// p4-04: rows with ids, the shape the DB round trip and the admin page
// actually work with (ProductPreferenceRowLike above is the read-path
// subset used by currentPreferenceMap/applyPreferredNames).
const history: PreferenceRow[] = [
  {
    id: "pref-1",
    canonical_ingredient: "mjölk",
    product_name: "Oatly Havredryck Deluxe",
    superseded_by: "pref-2",
    valid_from: "2026-03-01T00:00:00Z",
    source: "explicit",
    note: null,
  },
  {
    id: "pref-2",
    canonical_ingredient: "mjölk",
    product_name: "ICA Havredryck",
    superseded_by: null,
    valid_from: "2026-07-20T00:00:00Z",
    source: "explicit",
    note: null,
  },
  {
    id: "pref-3",
    canonical_ingredient: "pasta",
    product_name: "Spaghetti",
    superseded_by: null,
    valid_from: "2026-06-01T00:00:00Z",
    source: "explicit",
    note: null,
  },
];

describe("findCurrentRow", () => {
  it("returns the non-superseded row for the ingredient", () => {
    expect(findCurrentRow(history, "mjölk")?.id).toBe("pref-2");
    expect(findCurrentRow(history, "pasta")?.id).toBe("pref-3");
  });
  it("is null for an ingredient with no current row (never taught, or fully retired)", () => {
    expect(findCurrentRow(history, "ost")).toBeNull();
  });
  it("matches case-insensitively", () => {
    expect(findCurrentRow(history, "MJÖLK")?.id).toBe("pref-2");
  });
});

describe("planSupersede (append-only write plan)", () => {
  it("builds the insert and names the current row to supersede", () => {
    const plan = planSupersede(history, "mjölk", "Alpro Havredryck", "explicit");
    expect(plan.insert).toEqual({
      canonical_ingredient: "mjölk",
      product_name: "Alpro Havredryck",
      family_member_id: null, // gate call: per-person kept, always null in v0
      source: "explicit",
      note: null,
      superseded_by: null,
    });
    expect(plan.previous?.id).toBe("pref-2");
  });

  it("has no previous when the ingredient has never been taught", () => {
    const plan = planSupersede(history, "ost", "Oatly Crea Fraiche", "explicit");
    expect(plan.previous).toBeNull();
  });

  it("tags the correction-flow write with source='correction' and carries a note", () => {
    const plan = planSupersede(history, "pasta", "Penne", "correction", "nej, penne");
    expect(plan.insert.source).toBe("correction");
    expect(plan.insert.note).toBe("nej, penne");
    expect(plan.previous?.id).toBe("pref-3");
  });
});

describe("planUndo (append-only invariant: exactly one current row per ingredient)", () => {
  it("re-points the new row at the prior current row and restores it", () => {
    const plan = planUndo("pref-2", "pref-1");
    expect(plan).toEqual({ retireId: "pref-2", retireSupersededBy: "pref-1", restoreId: "pref-1" });
  });

  it("retires onto itself when there was nothing before it (brand-new teach, undone)", () => {
    const plan = planUndo("pref-3", null); // no earlier row for "pasta"
    expect(plan).toEqual({ retireId: "pref-3", retireSupersededBy: "pref-3", restoreId: null });
  });

  it("round-trips through a tiny in-memory apply: undo restores the exact prior state", () => {
    // Simulates the two-write DB round trip (insert new, then supersede old)
    // that bot/tools.ts and the admin hook perform, purely, to prove the
    // invariant without a database.
    const apply = (rows: PreferenceRow[], id: string, supersededBy: string | null) =>
      rows.map((r) => (r.id === id ? { ...r, superseded_by: supersededBy } : r));

    // Teach: mjölk -> Alpro (supersedes pref-2).
    const plan = planSupersede(history, "mjölk", "Alpro Havredryck", "explicit");
    const taught: PreferenceRow = {
      id: "pref-4",
      ...plan.insert,
      superseded_by: null,
      valid_from: "2026-08-30T00:00:00Z",
    };
    let rows = [...history, taught];
    rows = apply(rows, plan.previous!.id, "pref-4");
    expect(findCurrentRow(rows, "mjölk")?.id).toBe("pref-4");

    // Exactly one current row for mjölk.
    expect(rows.filter((r) => r.canonical_ingredient === "mjölk" && r.superseded_by === null)).toHaveLength(1);

    // Undo: back to pref-2.
    const undo = planUndo(taught.id, plan.previous!.id);
    rows = apply(rows, undo.retireId, undo.retireSupersededBy);
    if (undo.restoreId) rows = apply(rows, undo.restoreId, null);

    expect(findCurrentRow(rows, "mjölk")?.id).toBe("pref-2");
    expect(rows.filter((r) => r.canonical_ingredient === "mjölk" && r.superseded_by === null)).toHaveLength(1);
  });
});

describe("formatSinceMonth (chat voice — Script 3's casual 'was: ... since March')", () => {
  it("says the month name, localized, when the memory is from this year", () => {
    expect(formatSinceMonth("2026-03-01T00:00:00Z", "en", new Date("2026-08-30"))).toBe("March");
    expect(formatSinceMonth("2026-03-01T00:00:00Z", "sv", new Date("2026-08-30"))).toBe("mars");
  });
  it("adds the year once the memory crosses a year boundary", () => {
    expect(formatSinceMonth("2025-03-01T00:00:00Z", "en", new Date("2026-08-30"))).toBe("March 2025");
    expect(formatSinceMonth("2025-03-01T00:00:00Z", "sv", new Date("2026-08-30"))).toBe("mars 2025");
  });
});

describe("formatSinceDate (admin page — 'since <date>', app chrome stays English)", () => {
  it("renders a precise date", () => {
    expect(formatSinceDate("2026-07-20T00:00:00Z")).toBe("Jul 20, 2026");
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
