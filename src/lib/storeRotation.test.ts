// Store affinity + rotation (p5-02). The household's real cases (Pelle
// 2026-08-16): the "ost" they buy exists only at Willys/ICA; their oats
// only at Hemköp/Mathem/Willys. A single cheapest-winner therefore fails
// week over week — rotation picks a primary store per run, alternating
// among the stores an affinity item allows.
import { describe, expect, it } from "vitest";

import {
  allowedTerms,
  parseListEntries,
  suggestPrimary,
  type ListItem,
  type PrimaryCandidate,
  type RotationHistory,
} from "./storeRotation";

const ITEMS: ListItem[] = [
  ...["havremjölk", "krossade tomater", "pasta penne", "gul lök", "kikärtor"].map((term) => ({
    term,
    stores: null,
  })),
  { term: "ost", stores: ["willys", "ica"] },
  { term: "havregryn", stores: ["hemkop", "mathem", "willys"] },
];

// Ranks from the live 2026-08-16 fee-aware run (comparable totals).
const CANDIDATES: PrimaryCandidate[] = [
  { store: "ica", rank: 0, deliverable: true },
  { store: "mathem", rank: 1, deliverable: true },
  { store: "coop", rank: 2, deliverable: true },
  { store: "willys", rank: 3, deliverable: true },
  { store: "hemkop", rank: 4, deliverable: true },
];

describe("parseListEntries", () => {
  it("accepts plain strings, {name} and {name, stores}", () => {
    const items = parseListEntries([
      "gul lök",
      { name: "pasta penne" },
      { name: "ost", stores: ["Willys", "ICA"] },
    ]);
    expect(items).toEqual([
      { term: "gul lök", stores: null },
      { term: "pasta penne", stores: null },
      { term: "ost", stores: ["willys", "ica"] },
    ]);
  });

  it("rejects an empty affinity list — that would make the item unbuyable", () => {
    expect(() => parseListEntries([{ name: "ost", stores: [] }])).toThrow(/affinity/i);
  });
});

describe("allowedTerms", () => {
  it("excludes affinity items at stores outside their list", () => {
    expect(allowedTerms(ITEMS, "mathem")).not.toContain("ost");
    expect(allowedTerms(ITEMS, "mathem")).toContain("havregryn");
    expect(allowedTerms(ITEMS, "coop")).not.toContain("havregryn");
  });

  it("passes every term at a store all affinities allow", () => {
    expect(allowedTerms(ITEMS, "willys")).toHaveLength(ITEMS.length);
  });
});

describe("suggestPrimary", () => {
  it("with no history, picks the store covering the most items (willys covers all)", () => {
    const s = suggestPrimary(CANDIDATES, ITEMS, {});
    expect(s.primary).toBe("willys");
    expect(s.coverage).toBe(ITEMS.length);
  });

  it("rotates between tied-coverage stores week over week", () => {
    // Only ost is affinity-bound: willys and ica tie at 6/6.
    const items = ITEMS.filter((i) => i.term !== "havregryn");
    const afterWillys: RotationHistory = { ost: { store: "willys", date: "2026-08-09" } };
    expect(suggestPrimary(CANDIDATES, items, afterWillys).primary).toBe("ica");
    const afterIca: RotationHistory = { ost: { store: "ica", date: "2026-08-16" } };
    expect(suggestPrimary(CANDIDATES, items, afterIca).primary).toBe("willys");
  });

  it("reports what rotates away, for the human-readable reason", () => {
    const items = ITEMS.filter((i) => i.term !== "havregryn");
    const s = suggestPrimary(CANDIDATES, items, { ost: { store: "willys", date: "2026-08-09" } });
    expect(s.rotations).toEqual([{ term: "ost", from: "willys", date: "2026-08-09" }]);
  });

  it("never suggests a store that cannot deliver when a deliverable one covers as much", () => {
    const items = ITEMS.filter((i) => i.term !== "havregryn");
    const candidates = CANDIDATES.map((c) =>
      c.store === "ica" ? { ...c, deliverable: false } : c,
    );
    // Rotation wants ica (last ost run: willys), but ica can't deliver.
    const s = suggestPrimary(candidates, items, { ost: { store: "willys", date: "2026-08-09" } });
    expect(s.primary).toBe("willys");
  });

  it("breaks coverage-and-rotation ties on comparable rank", () => {
    const items = ITEMS.filter((i) => i.term !== "havregryn");
    // No history: willys and ica both cover 6/6 with zero rotation
    // penalty — ica ranks better (cheaper), so it wins.
    expect(suggestPrimary(CANDIDATES, items, {}).primary).toBe("ica");
  });

  it("lists affinity items the primary cannot supply as shop-separately", () => {
    // Force mathem primary: only candidate. It may not sell ost.
    const s = suggestPrimary([{ store: "mathem", rank: 0, deliverable: true }], ITEMS, {});
    expect(s.primary).toBe("mathem");
    expect(s.unsourced).toEqual(["ost"]);
  });

  it("returns null primary for no candidates", () => {
    const s = suggestPrimary([], ITEMS, {});
    expect(s.primary).toBeNull();
  });
});
