import { describe, expect, it } from "vitest";
import {
  applyScale,
  describeChanges,
  expandTermCandidates,
  interpretEdit,
} from "./recipeEdits";

const SYNONYMS = [
  { key: "garlic", synonyms: ["garlic", "garlic clove", "vitlök"] },
  { key: "garlic-powder", synonyms: ["garlic powder", "vitlökspulver"] },
  { key: "soy-sauce", synonyms: ["soy sauce", "soja"] },
];

const TABLE = `---
id: "mapo-tofu"
title: "Mapo Tofu"
---

## Ingredients

| quantity | unit | key | ingredient | notes |
|----------|------|-----|------------|-------|
| 3        | st   | garlic | garlic cloves | pressed |
| 1        | tsp  | garlic-powder | garlic powder | |
| 6–10     | st   | garlic | garlic cloves | thinly sliced |
| 2-3      |      | chili | dried chilies | |
| 0.5      | dl   | soy-sauce | soy sauce | |
| 1/2      | tsp  | salt | salt | |
|          |      | scallion | scallions | to serve |

## Instructions

1. Cook 🥘
`;

describe("interpretEdit", () => {
  it("reads the verb + term from raw Swedish, past titles and tails", () => {
    expect(interpretEdit("dubbla vitlöken i mapo tofun nästa gång")).toEqual({ factor: 2, term: "vitlöken" });
    expect(interpretEdit("kan du halvera saltet?")).toEqual({ factor: 0.5, term: "saltet" });
    expect(interpretEdit("tredubbla mängden soja, tack")).toEqual({ factor: 3, term: "soja" });
  });

  it("reads English too", () => {
    expect(interpretEdit("double the garlic in mapo tofu")).toEqual({ factor: 2, term: "garlic" });
  });

  it("returns null for anything outside the enumerable verbs", () => {
    expect(interpretEdit("mindre stark nästa gång")).toBeNull();
    expect(interpretEdit("grymt recept!")).toBeNull();
    expect(interpretEdit("dubbla")).toBeNull(); // verb with no term
  });
});

describe("expandTermCandidates", () => {
  it("bridges a Swedish definite form to the table key via synonyms", () => {
    const candidates = expandTermCandidates("vitlöken", SYNONYMS);
    expect(candidates).toContain("vitlök");
    expect(candidates).toContain("garlic");
    expect(candidates).not.toContain("garlic-powder");
  });
});

describe("applyScale", () => {
  const garlic = expandTermCandidates("vitlöken", SYNONYMS);

  it("scales exact-key rows only — garlic, never garlic-powder", () => {
    const result = applyScale(TABLE, garlic, 2);
    if (!result.ok) throw new Error("expected ok");
    expect(result.changes).toEqual([
      { key: "garlic", ingredient: "garlic cloves", unit: "st", from: "3", to: "6" },
      { key: "garlic", ingredient: "garlic cloves", unit: "st", from: "6–10", to: "12–20" },
    ]);
    expect(result.markdown).toContain("| 6 | st   | garlic | garlic cloves | pressed |");
    expect(result.markdown).toContain("| 12–20 | st   | garlic | garlic cloves | thinly sliced |");
    expect(result.markdown).toContain("| 1        | tsp  | garlic-powder"); // untouched
  });

  it("scales hyphen ranges, decimals, and fractions", () => {
    const chili = applyScale(TABLE, ["chili"], 2);
    if (!chili.ok) throw new Error("expected ok");
    expect(chili.changes[0]).toMatchObject({ from: "2-3", to: "4-6" });

    const soy = applyScale(TABLE, expandTermCandidates("sojan", SYNONYMS), 0.5);
    if (!soy.ok) throw new Error("expected ok");
    expect(soy.changes[0]).toMatchObject({ from: "0.5", to: "0.25", unit: "dl" });

    const salt = applyScale(TABLE, ["salt"], 2);
    if (!salt.ok) throw new Error("expected ok");
    expect(salt.changes[0]).toMatchObject({ from: "1/2", to: "1" });
  });

  it("falls back to a word-boundary display match when no key matches", () => {
    const result = applyScale(TABLE, ["chilies"], 2);
    if (!result.ok) throw new Error("expected ok");
    expect(result.changes[0].key).toBe("chili");
  });

  it("refuses when nothing matches or nothing is numeric", () => {
    expect(applyScale(TABLE, ["saffran"], 2)).toEqual({ ok: false, reason: "no-match" });
    expect(applyScale(TABLE, ["scallion"], 2)).toEqual({ ok: false, reason: "not-numeric" });
  });

  it("touches only the Ingredients section", () => {
    const result = applyScale(TABLE, garlic, 2);
    if (!result.ok) throw new Error("expected ok");
    expect(result.markdown).toContain("1. Cook 🥘");
    expect(result.markdown.indexOf("## Instructions")).toBeGreaterThan(0);
  });
});

describe("describeChanges", () => {
  it("renders per-row before→after lines for the confirm message", () => {
    const result = applyScale(TABLE, expandTermCandidates("vitlöken", SYNONYMS), 2);
    if (!result.ok) throw new Error("expected ok");
    expect(describeChanges(result.changes)).toBe(
      "• garlic cloves: 3 → 6 st\n• garlic cloves: 6–10 → 12–20 st",
    );
  });
});
