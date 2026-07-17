---
id: p1-05-validate-recipe
title: recipe-format.spec.md + ./harness validate-recipe + README fix
phase: P1
status: todo
depends_on: [p1-01-spec-extraction]
---

## Goal

Make the recipe file format a first-class contract with one source of
truth, spec-first:

1. `docs/specs/recipe-format.spec.md` — the single authoritative
   definition of the format (frontmatter schema, ingredient-table
   shape, required sections, semantics of each field). The format is
   this repo's most real data contract: the loader, the validator, and
   every future recipe PR depend on it.
2. `./harness validate-recipe [file]` — a deterministic validator
   implemented *against that spec*, running over all recipes when no
   file is given, joining `./harness check`.
3. Fix the documentation drift found during spec extraction: the
   recipes README becomes a short pointer to the spec, and
   tech.spec.md's Data model section is trimmed to reference it.

## Non-goals

- No changes to the recipe format itself — this plan *records* the
  shipped format; evolving it is a later human decision (made easy by
  the new spec).
- No nutrition-data validation (optional field, no schema yet).
- No duplicated format prose: after this plan, exactly one document
  (recipe-format.spec.md) defines the format; everything else points at
  it.

## Context

Spec extraction (`p1-01`) found `src/data/recipes/README.md` still
documents a retired list-based ingredient format with
`[base]`/`[esoteric]` markers, while `recipeLoader.ts` and all 19 recipe
files use a markdown table (`quantity | unit | key | ingredient |
notes`). The format is currently described in prose inside
[tech.spec.md](../specs/tech.spec.md) (Data model) — accurate but not a
standalone contract — and recipes are validated only implicitly: a
malformed file fails silently at load time in the browser. Ground truth
for writing the spec: `src/services/recipeLoader.ts` (the parser) and
the 19 files in `src/data/recipes/` (the corpus).

## Progress

- [ ] docs/specs/recipe-format.spec.md written from loader + corpus
      (frontmatter: id/kebab-case + unique, title, imageUrl, cookTime
      int, servings int, difficulty enum, tags list; body: Ingredients
      table with the 5 columns, Instructions ordered list, optional
      Notes; field semantics and units conventions)
- [ ] validate-recipe implemented against the spec
- [ ] all 19 recipes pass (or violations fixed in the same change set)
- [ ] command joins ./harness check
- [ ] src/data/recipes/README.md reduced to a pointer at the spec;
      tech.spec.md Data model trimmed to reference it

## Steps

1. Write `docs/specs/recipe-format.spec.md` first, derived from
   `recipeLoader.ts` and the corpus. Where loader behavior and files
   disagree, record the discrepancy in the plan and stop for a human
   call (format changes are not this plan's to make).
2. Implement the validator in `harness` against the spec (reuse its
   zero-dep frontmatter parser; add table parsing).
3. Run over the corpus; fix any violating recipe files.
4. Add to the `check` chain (fast: pure file parsing).
5. Rewrite the recipes README as a pointer to the spec; trim the
   duplicated format prose from tech.spec.md's Data model section.

## Verification

- `./harness validate-recipe` green over all recipes; a deliberately
  malformed fixture fails naming file + field (transcript in Evidence).
- `./harness check` fails when a recipe is malformed.
- Exactly one document defines the format: README and tech.spec.md
  contain pointers, not format prose, and the validator's rules match
  the spec one-for-one.

## Evidence

(appended during implementation)
