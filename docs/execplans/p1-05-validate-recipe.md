---
id: p1-05-validate-recipe
title: ./harness validate-recipe + fix the recipe-format README drift
phase: P1
status: todo
depends_on: [p1-01-spec-extraction]
---

## Goal

A deterministic `./harness validate-recipe [file]` command that checks
recipe markdown against the real format (frontmatter schema +
ingredient-table shape + required sections), runs over all recipes when
no file is given, and joins `./harness check`. Also fixes the
documentation drift found during spec extraction.

## Non-goals

- No changes to the recipe format itself (that would be a
  product/tech spec change — human decision).
- No nutrition-data validation (optional field, no schema yet).

## Context

Spec extraction (`p1-01`) found `src/data/recipes/README.md` still
documents a retired list-based ingredient format with
`[base]`/`[esoteric]` markers, while `recipeLoader.ts` and all 19 recipe
files use a markdown table (`quantity | unit | key | ingredient |
notes`). The authoritative format is recorded in
[tech.spec.md](../specs/tech.spec.md) (Data model). Recipes are
currently validated only implicitly — a malformed file fails silently at
load time in the browser.

## Progress

- [ ] validate-recipe implemented (frontmatter: id/kebab-case + unique,
      title, imageUrl, cookTime int, servings int, difficulty enum,
      tags list; body: Ingredients table with the 5 columns,
      Instructions ordered list)
- [ ] all 19 recipes pass (or violations fixed in the same change set)
- [ ] command joins ./harness check
- [ ] src/data/recipes/README.md rewritten to the table format

## Steps

1. Implement the validator in `harness` (reuse its zero-dep frontmatter
   parser; add table parsing).
2. Run over the corpus; fix any violating recipe files.
3. Add to the `check` chain (fast: pure file parsing).
4. Rewrite the recipes README from tech.spec.md's Data model section.

## Verification

- `./harness validate-recipe` green over all recipes; a deliberately
  malformed fixture fails naming file + field (transcript in Evidence).
- `./harness check` fails when a recipe is malformed.
- README and tech.spec.md agree with the loader.

## Evidence

(appended during implementation)
