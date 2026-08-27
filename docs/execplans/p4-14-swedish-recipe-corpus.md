---
id: p4-14-swedish-recipe-corpus
title: Recept på svenska — the recipe corpus reads Swedish-first
phase: P4
status: todo
depends_on: [p4-13-recipe-images]
---

## Goal

Directive Pelle 2026-08-27: "default to Swedish recipes rather than
English." The household reads recipes in Swedish: titles (where a
Swedish name is natural — "Krämig potatis- och purjolökssoppa", while
established names like "Mapo Tofu" stay), ingredient display names,
instructions, and notes are Swedish across all recipes in
`src/data/recipes/`. Machine identity is untouched: recipe `id`
slugs, ingredient `key` column values, and frontmatter field names
stay exactly as they are (DB rows, deep links, the bot's
ingredients.json sv→key bridge, and fixtures all reference them).
design.spec's voice section is updated in the same change set
(recipe content Swedish-first; app chrome copy stays English until
directed otherwise) — pre-authorized by the directive.

## Non-goals

- No app-chrome translation (buttons, headers, empty states stay
  English for now — separate decision).
- No bilingual toggle or per-user language setting.
- No recipe *selection* changes — this is language, not which dishes
  are in the library.
- No `id`/`key`/frontmatter-field renames, ever, in this plan.

## Context

31 recipes in `src/data/recipes/`, format per recipe-format.spec
(frontmatter + `## Ingredients` table with `quantity/unit/key/
ingredient/notes` columns + `## Instructions` + optional `## Notes`).
The `ingredient` column is the display name → translate; the `key`
column is the machine key → frozen. Swedish culinary conventions:
metric stays, `tbsp/tsp` become `msk/tsk` in *display* text where
they appear inside instructions; the `unit` column's vocabulary is
constrained by the format spec + scaling tests — check
`src/lib/ingredientScaling` + validate-recipe before touching units,
and extend the allowed-unit set spec-first only if needed. Tests and
fixtures that assert on English strings (unit tests, e2e like
`MAPO_TOFU_TITLE`, `fixtures/`) must be updated with the content.
The bot's Swedish NLU (p4-09's sv→key bridge) should only get
*better* when display names are Swedish — its fixtures must stay
green untouched or be updated deliberately, never weakened.

## Progress

- [ ] Translation conventions recorded (title policy, unit display
      policy) after checking the scaling/validation constraints
- [ ] All 31 recipes translated; ids/keys/fields untouched (diff
      audited mechanically: `git diff` shows no `id:`/`key` changes)
- [ ] Tests/fixtures updated alongside; validate-recipe green
- [ ] design.spec voice section updated (same change set)
- [ ] `./harness check` + `./harness e2e` green

## Steps

1. Read recipe-format.spec + ingredientScaling/normalization tests;
   record the unit-display policy in this plan before translating.
2. Translate in batches (5–8 recipes per pass), running
   `./harness validate-recipe` after each batch.
3. Sweep tests/fixtures/e2e constants for English recipe strings;
   update deliberately.
4. Update design.spec voice ("recipe content is Swedish-first…").
5. Full gate + e2e; mechanical diff audit for id/key stability;
   evidence; commit.

## Verification

- `./harness check` green; e2e green with Swedish titles.
- `grep`-audit in Evidence proving no `id:` or ingredient `key`
  changed.
- Household spot-read: a recipe reads naturally in Swedish (human
  bullet).

## Evidence

(recorded during implementation)
