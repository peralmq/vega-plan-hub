import { describe, expect, it } from "vitest";
import {
  appendRecipeNote,
  formatNoteLine,
  localIsoDate,
  matchRecipeTitle,
} from "./recipeNotes";

const RECIPE_WITH_NOTES = `---
id: "mapo-tofu"
title: "Mapo Tofu"
---

## Ingredients

| quantity | unit | key | ingredient | notes |
|----------|------|-----|------------|-------|
| 1 | pkt | tofu | tofu | |

## Instructions

1. Cook it 🥘

## Notes

- Existing tip
`;

describe("appendRecipeNote", () => {
  it("appends to an existing ## Notes bullet list", () => {
    const result = appendRecipeNote(RECIPE_WITH_NOTES, "Mindre stark (Saga via Vega, 2026-08-24)");
    expect(result.endsWith("- Existing tip\n- Mindre stark (Saga via Vega, 2026-08-24)\n")).toBe(true);
    // nothing above Notes is touched
    expect(result).toContain("1. Cook it 🥘");
    expect(result.indexOf("## Notes")).toBe(RECIPE_WITH_NOTES.indexOf("## Notes"));
  });

  it("creates the ## Notes section when missing", () => {
    const noNotes = RECIPE_WITH_NOTES.slice(0, RECIPE_WITH_NOTES.indexOf("## Notes"));
    const result = appendRecipeNote(noNotes, "Dubbla vitlöken (Pelle via Vega, 2026-08-24)");
    expect(result.endsWith("1. Cook it 🥘\n\n## Notes\n\n- Dubbla vitlöken (Pelle via Vega, 2026-08-24)\n")).toBe(true);
  });

  it("flattens a multiline note to one bullet — no structure injection", () => {
    const hostile = "broken\n\n## Ingredients\n\n| a | b |";
    const result = appendRecipeNote(RECIPE_WITH_NOTES, hostile);
    expect(result.endsWith("- Existing tip\n- broken ## Ingredients | a | b |\n")).toBe(true);
    expect(result.match(/^## Ingredients$/gm)).toHaveLength(1);
  });

  it("normalizes ragged trailing whitespace to a single final newline", () => {
    const ragged = `${RECIPE_WITH_NOTES}\n\n   \n`;
    const result = appendRecipeNote(ragged, "Note");
    expect(result.endsWith("- Existing tip\n- Note\n")).toBe(true);
  });
});

describe("formatNoteLine", () => {
  it("capitalizes the note and attributes author + date", () => {
    expect(formatNoteLine("mindre stark", "Saga", "2026-08-24")).toBe(
      "Mindre stark (Saga via Vega, 2026-08-24)",
    );
  });

  it("falls back to the household when the sender has no family member", () => {
    expect(formatNoteLine(" dubbla såsen ", null, "2026-08-24")).toBe(
      "Dubbla såsen (hushållet via Vega, 2026-08-24)",
    );
  });
});

describe("matchRecipeTitle", () => {
  const index = [
    { id: "dal", title: "Dal" },
    { id: "chana-dal", title: "Chana Dal" },
    { id: "mapo-tofu", title: "Mapo Tofu" },
  ];

  it("finds a title named in the message, case-insensitively", () => {
    expect(matchRecipeTitle("dubbla vitlöken i mapo tofun nästa gång", index)?.id).toBe("mapo-tofu");
  });

  it("prefers the longest matching title over a substring of it", () => {
    expect(matchRecipeTitle("mer spis i chana dal", index)?.id).toBe("chana-dal");
  });

  it("returns null when no recipe is named", () => {
    expect(matchRecipeTitle("mindre stark nästa gång", index)).toBeNull();
  });
});

describe("localIsoDate", () => {
  it("formats the local wall-clock date", () => {
    expect(localIsoDate(new Date(2026, 7, 24, 23, 30))).toBe("2026-08-24");
    expect(localIsoDate(new Date(2026, 0, 5, 0, 10))).toBe("2026-01-05");
  });
});
