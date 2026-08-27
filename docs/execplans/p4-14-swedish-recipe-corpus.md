---
id: p4-14-swedish-recipe-corpus
title: Recept på svenska — the recipe corpus reads Swedish-first
phase: P4
status: in-progress
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

- [x] (2026-08-27) Translation conventions recorded (title policy, unit
      display policy) after checking the scaling/validation constraints.
      See Decision Log below.
- [x] (2026-08-27) All 30 recipes in `src/data/recipes/` translated
      (the directory has 31 files but one, `README.md`, is
      documentation, not a recipe — see recipe-format.spec.md); ids/
      keys/fields untouched (diff audited mechanically, three separate
      scripted checks, all zero mismatches — see Evidence)
- [x] (2026-08-27) Tests/fixtures swept; none needed updates
      (delegated survey confirmed every e2e/unit-test/bot-fixture
      dependency on recipe strings either matches an established name
      kept verbatim, or is self-contained/generic — see Decision Log);
      validate-recipe green
- [x] (2026-08-27) design.spec voice section updated (same change set)
- [x] (2026-08-27) `./harness check` + `./harness e2e` green

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

- [x] `./harness check` green; e2e green with Swedish titles (see
      Evidence).
- [x] `grep`-audit in Evidence proving no `id:` or ingredient `key`
      changed (see Evidence — three scripted checks, all zero).
- [ ] Household spot-read: a recipe reads naturally in Swedish (human
      bullet) — **not done by this implementer; human-only check.**
      Plan `status` left `in-progress` for this reason; ready for a
      human to read a recipe or two (suggest `mapo-tofu.md` for a
      short one, `vegan-moussaka.md` for a long one) and flip to
      `done`.

## Decision Log

**2026-08-27 — unit-display policy.** Checked
`src/lib/ingredientScaling.ts` + `.test.ts`,
`src/lib/ingredientNormalization.ts` + `.test.ts`, and `./harness
validate-recipe`'s frontmatter/table validation (`harness`, function
`validateRecipeFrontmatter`/table-row checks around lines 217-300 —
no unit-vocabulary check exists; `unit` cells are free text).

Corpus survey of the `unit` column across all 31 recipes today: `bag,
bottle, bunch, dl, g, jar, kg, krm, liter, ml, port, st, tbsp, tsp`.
Several are already Swedish (`dl`, `g`, `kg`, `krm`, `liter`, `ml`,
`port`, `st`) or language-neutral; only `tbsp`/`tsp` (and the English
container words `bag`/`bottle`/`bunch`/`jar`) read as English.

`ingredientScaling.ts`'s `UNIT_GROUPS` alias table *does* recognize
Swedish `tsk`/`msk` as aliases of `tsp`/`tbsp` (same base unit,
correctly interchangeable for the Cook Mode servings-scaler). BUT
`ingredientNormalization.ts` (used by the Shopping Summary's
`aggregateIngredients`/`convertIngredientToMetric`/
`getNormalizedIngredientKey`) has its own, narrower unit tables
(`IMPERIAL_TO_METRIC`, `METRIC_UNITS`, and the `isVolume`/`isWeight`
lookup lists) that do **not** include `msk`/`tsk` — confirmed no test
in `ingredientNormalization.test.ts` covers them either. Renaming a
`unit` cell from `tbsp`→`msk` would keep Cook Mode scaling correct but
silently break Shopping Summary metric conversion (falls through to
"unknown unit, return as-is" — no ml conversion) and would split that
ingredient's aggregation key (`|volume` suffix lost), causing the same
ingredient bought in `tbsp` vs `msk` across two recipes to stop
merging into one shopping-list line. Extending
`ingredientNormalization.ts`'s alias tables to add `msk`/`tsk` would
fix this but is a pipeline/spec change, not authorized by this plan
(plan explicitly says: extend the allowed-unit set spec-first only if
needed, stop and report instead of doing it silently).

**2026-08-27 — ingredient-display aggregation risk + e2e sweep.**
Delegated a corpus-wide survey of every place outside
`src/data/recipes/` that references English recipe strings. Key
findings, both resolved without touching pipeline code:

- `src/lib/ingredientNormalization.ts`'s `getNormalizedIngredientKey`
  (used by the Shopping Summary's `aggregateIngredients`) derives its
  merge key from `normalizeIngredientName(ingredient.ingredient)` —
  the **display** column, not the frozen `key` column — via a mostly
  English `INGREDIENT_ALIASES` dictionary that falls through to a
  literal lowercased/trimmed string match for anything not in the
  table. `e2e/shopping-summary.spec.ts` depends on this: chana-dal and
  palak-paneer share several *identical* English ingredient-cell
  strings today (`"garlic cloves, finely chopped"`, `"onion, finely
  chopped"`, `"turmeric"`) and merge on exact string match, not via
  the alias table (those exact phrases aren't dictionary entries).
  **Mitigation:** translate matching English source phrases to
  identical Swedish output phrases across recipes (verified
  chana-dal/palak-paneer specifically, since the e2e test pins them).
  No change to `ingredientNormalization.ts` needed or made — the
  existing exact-match fallback keeps working char-for-char in
  Swedish. `INGREDIENT_ALIASES` growing Swedish synonyms (the file
  already does this incrementally, see the `mjölk` group added
  2026-08-14) is a legitimate future improvement but out of scope
  here since nothing requires it to pass the harness gate or e2e.
- `src/data/ingredients/ingredients.json` (the bot's sv→key bridge,
  p4-09) has English `display`/mostly-English `synonyms` fields, read
  by `src/lib/recipeEdits.ts` for the chat "double the garlic"
  word-boundary fallback match against a recipe's ingredient display
  cell. `src/lib/recipeEdits.test.ts` and `recipeNotes.test.ts` use
  self-contained inline markdown fixtures (not the real corpus), so
  they stay green untouched by this change. Live chat-edit matching
  against the now-Swedish display column is not exercised by
  `./harness check` or `./harness e2e` — noted as residual risk in the
  handoff, not a blocker.
- e2e sweep: `e2e/cook-mode.spec.ts`, `shopping-summary.spec.ts`,
  `plan-pool.spec.ts`, `cook-mode-deep-link.spec.ts`,
  `recipe-image-fallback.spec.ts` all match recipe titles via
  case-insensitive regex against `Chana Dal` / `Mapo Tofu` / `Palak
  Paneer` — all three are established international dish names kept
  verbatim in this pass (Palak Paneer treated the same as the plan's
  explicit Chana Dal/Mapo Tofu examples), so **no e2e file needed
  changes**. `e2e/support/mockDb.ts` seeds by `recipe_id` slug only,
  no title/ingredient text. `src/lib/__fixtures__/*.json` bot NLU
  fixtures reference only generic/loanword grocery terms or the
  kept-verbatim "mapo tofu" name — confirmed no updates needed there
  either.

**Policy adopted:** the `unit` **column** (the 3rd ingredient-table
cell) is left byte-for-byte untouched everywhere in this pass — same
treatment as `id`/`key`, even though it isn't nominally frozen by the
plan's Non-goals, because the pipeline gap makes translating it unsafe
without a spec change. Unit *mentions inside prose* (`##
Instructions` steps, `## Notes` bullets — free text, never parsed by
any scaling/aggregation code) ARE translated to natural Swedish
(msk/tsk/dl/g/kg as appropriate) as part of normal prose translation,
since those strings are display-only and touch no pipeline.

## Evidence

Translated all 30 recipe files in `src/data/recipes/*.md` (excludes
`README.md`, documentation not a recipe) in 5 batches of 6, running
`./harness validate-recipe` after each batch — all green throughout,
final:

```
$ ./harness validate-recipe
validate-recipe: OK (30 recipes)
```

**Mechanical diff audit — id/key/unit/tags stability** (three
independent scripted checks against `git show HEAD:<file>`, all zero):

```
$ git diff -U0 src/data/recipes/ | grep -c '^[-+]id:'
0
```

```
$ node -e '... extractKeys() parses the ## Ingredients table per file,
  compares old (git show HEAD) vs new key-column arrays ...'
Total files with key-column mismatches: 0
```

```
$ node -e '... same extraction for the unit column (3rd cell) ...'
Total files with unit-column mismatches: 0
```

```
$ for f in src/data/recipes/*.md; do
    # compare sorted frontmatter field names, old vs new
  done
frontmatter field-name audit done   # (no FIELD MISMATCH lines printed)
```

```
$ git diff -U0 -- src/data/recipes/ | grep -E '^[-+]tags:' | wc -l
0
```

**Full harness gate:**

```
$ ./harness check
check: deps ... OK (73 deps present)
check: npm run lint ... OK (8/8 warnings)
check: npm test ... OK
check: npm run build ... OK
check: tsc bot ... OK
check: tsc compare ... OK
check: plans --validate ... plans validate: OK (31 plans)
check: validate-recipe ... validate-recipe: OK (30 recipes)
check: OK
```

**e2e (after `npx playwright install chromium`):**

```
$ ./harness e2e
Running 21 tests using 5 workers
  21 passed (5.9s)
```

All 21 e2e tests passed unmodified, including
`e2e/shopping-summary.spec.ts`'s cross-recipe aggregation assertion
(`/×2 recipes/i`, chana-dal + palak-paneer) — validates the
ingredient-display consistency policy from the Decision Log without
touching `ingredientNormalization.ts`.

No test, fixture, or e2e file needed changes — `npm test` and
`./harness e2e` passed against the translated corpus with zero
modifications outside `src/data/recipes/*.md` and
`docs/specs/design.spec.md`. See Decision Log for why (self-contained
fixtures, established-name titles kept verbatim, generic/loanword bot
NLU fixtures).
