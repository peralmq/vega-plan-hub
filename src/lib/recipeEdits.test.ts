import { describe, expect, it } from "vitest";
import {
  applyEdit,
  describeChanges,
  expandTermCandidates,
  interpretEdit,
  type EditIntent,
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

const scale = (factor: number, term: string): EditIntent =>
  ({ kind: "scale", factor, term, phrase: `x ${term}`, confident: true });

describe("interpretEdit", () => {
  it("reads the confident verbs from raw Swedish, past titles and tails", () => {
    expect(interpretEdit("dubbla vitlöken i mapo tofun nästa gång")).toMatchObject({
      kind: "scale", factor: 2, term: "vitlöken", confident: true,
    });
    expect(interpretEdit("kan du halvera saltet?")).toMatchObject({ factor: 0.5, term: "saltet" });
    expect(interpretEdit("tredubbla mängden soja, tack")).toMatchObject({ factor: 3, term: "soja" });
    expect(interpretEdit("dubblera chilin")).toMatchObject({ factor: 2, term: "chilin" });
  });

  it("reads the vaguer mer/mindre family as low-confidence household factors", () => {
    expect(interpretEdit("mindre salt nästa gång")).toMatchObject({
      kind: "scale", factor: 0.75, term: "salt", confident: false,
    });
    expect(interpretEdit("mer chili nästa gång tack")).toMatchObject({ factor: 1.5, term: "chili" });
    expect(interpretEdit("för salt förra gången, dra ner på saltet")).toMatchObject({
      factor: 0.75, term: "saltet",
    });
    expect(interpretEdit("öka på vitlöken")).toMatchObject({ factor: 1.5, term: "vitlöken" });
  });

  it("reads set-to-N phrasings", () => {
    expect(interpretEdit("ändra vitlöken till 4")).toMatchObject({
      kind: "set", value: "4", term: "vitlöken", confident: true,
    });
    expect(interpretEdit("ta 1,5 dl soja istället")).toMatchObject({
      kind: "set", value: "1.5", term: "dl soja",
    });
    expect(interpretEdit("change the garlic to 6")).toMatchObject({ kind: "set", value: "6", term: "garlic" });
  });

  it("reads English scale verbs too", () => {
    expect(interpretEdit("double the garlic in mapo tofu")).toMatchObject({ factor: 2, term: "garlic" });
  });

  it("returns null for anything outside the enumerable verbs", () => {
    expect(interpretEdit("mindre stark nästa gång")).toMatchObject({ factor: 0.75, term: "stark" }); // interpretable — no such row, so it becomes a note downstream
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

  it("tries individual words of a multi-word term", () => {
    expect(expandTermCandidates("dl soja", SYNONYMS)).toContain("soy-sauce");
  });
});

describe("applyEdit", () => {
  const garlic = expandTermCandidates("vitlöken", SYNONYMS);

  it("scales exact-key rows only — garlic, never garlic-powder", () => {
    const result = applyEdit(TABLE, garlic, scale(2, "vitlöken"));
    if (!result.ok) throw new Error("expected ok");
    expect(result.changes).toEqual([
      { key: "garlic", ingredient: "garlic cloves", unit: "st", from: "3", to: "6" },
      { key: "garlic", ingredient: "garlic cloves", unit: "st", from: "6–10", to: "12–20" },
    ]);
    expect(result.markdown).toContain("| 1        | tsp  | garlic-powder"); // untouched
  });

  it("scales hyphen ranges, decimals, and fractions", () => {
    const chili = applyEdit(TABLE, ["chili"], scale(2, "chili"));
    if (!chili.ok) throw new Error("expected ok");
    expect(chili.changes[0]).toMatchObject({ from: "2-3", to: "4-6" });

    const soy = applyEdit(TABLE, expandTermCandidates("sojan", SYNONYMS), scale(0.5, "soja"));
    if (!soy.ok) throw new Error("expected ok");
    expect(soy.changes[0]).toMatchObject({ from: "0.5", to: "0.25", unit: "dl" });

    const salt = applyEdit(TABLE, ["salt"], scale(2, "salt"));
    if (!salt.ok) throw new Error("expected ok");
    expect(salt.changes[0]).toMatchObject({ from: "1/2", to: "1" });
  });

  it("sets a single matched row to N, and refuses an ambiguous set", () => {
    const set: EditIntent = { kind: "set", value: "1", term: "sojan", phrase: "", confident: true };
    const soy = applyEdit(TABLE, expandTermCandidates("sojan", SYNONYMS), set);
    if (!soy.ok) throw new Error("expected ok");
    expect(soy.changes[0]).toMatchObject({ from: "0.5", to: "1" });

    const twoRows = applyEdit(TABLE, garlic, { ...set, term: "vitlöken" });
    expect(twoRows).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("falls back to a word-boundary display match when no key matches", () => {
    const result = applyEdit(TABLE, ["chilies"], scale(2, "chilies"));
    if (!result.ok) throw new Error("expected ok");
    expect(result.changes[0].key).toBe("chili");
  });

  it("refuses when nothing matches or nothing is numeric", () => {
    expect(applyEdit(TABLE, ["saffran"], scale(2, "saffran"))).toEqual({ ok: false, reason: "no-match" });
    expect(applyEdit(TABLE, ["scallion"], scale(2, "scallion"))).toEqual({ ok: false, reason: "not-numeric" });
  });

  it("touches only the Ingredients section", () => {
    const result = applyEdit(TABLE, garlic, scale(2, "vitlöken"));
    if (!result.ok) throw new Error("expected ok");
    expect(result.markdown).toContain("1. Cook 🥘");
  });
});

describe("describeChanges", () => {
  it("renders per-row before→after lines for the confirm message", () => {
    const result = applyEdit(TABLE, expandTermCandidates("vitlöken", SYNONYMS), scale(2, "vitlöken"));
    if (!result.ok) throw new Error("expected ok");
    expect(describeChanges(result.changes)).toBe(
      "• garlic cloves: 3 → 6 st\n• garlic cloves: 6–10 → 12–20 st",
    );
  });
});
