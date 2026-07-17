---
id: p1-05-validate-recipe
title: recipe-format.spec.md + ./harness validate-recipe + README fix
phase: P1
status: done
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

- [x] 2026-07-17 docs/specs/recipe-format.spec.md written from loader +
      corpus (frontmatter: id/kebab-case + unique, title, imageUrl,
      cookTime int, servings int, difficulty enum, tags list; body:
      Ingredients table with the 5 columns, Instructions ordered list,
      optional Notes; field semantics and units conventions).
- [x] 2026-07-17 validate-recipe implemented against the spec
      (`./harness validate-recipe [file]`); reused the loader's
      hand-rolled frontmatter-parsing approach, added table/list
      parsing. Verified correct on both a well-formed single file and a
      deliberately malformed fixture (see Evidence).
- [x] 2026-07-17 all 18 recipes pass. Running validate-recipe over the
      full corpus first found a real loader/corpus disagreement in
      `vegan-dan-dan-noodles.md` (multi-line `tags:` array silently
      dropped to `[]` by the loader) — reported per the stop condition,
      then resolved by orchestrator ruling: the recipe file was fixed
      (tags collapsed onto one line, content preserved); the parser was
      not changed. See Surprises & Discoveries and Evidence. (The
      plan's "19 recipes" figure was already stale — the committed
      corpus is 18 recipe files + README; see p1-02's Evidence.)
- [x] 2026-07-17 command joins ./harness check (after plans
      --validate; pure file parsing, fast). Demonstrated red in both
      directions — see Evidence.
- [x] 2026-07-17 src/data/recipes/README.md reduced to a pointer at
      the spec; tech.spec.md Data model format prose + resolved "Known
      drift" note trimmed to a reference; harness.spec.md
      validate-recipe row moved from Planned Commands into the command
      set and the Level 2 maturity row marked done.

## Surprises & Discoveries

- 2026-07-17: `src/data/recipes/vegan-dan-dan-noodles.md` frontmatter
  wraps `tags` onto a continuation line:
  ```
  tags:
    ["Chinese", "Asian", "Noodles", "Vegan", "Lunch", "Dinner", "Climate Smart"]
  ```
  `recipeLoader.ts`'s `parseFrontmatter` only reads a value from the same
  line as `key:`; a line with no `:` is skipped
  (`if (colonIndex === -1) continue;`). So in the running app,
  `frontmatter.tags` for this recipe is the empty string `""` (parsed
  from the bare `tags:` line), which `frontmatter.tags || []` then
  coerces to an **empty array** — all 7 intended tags are silently
  dropped, and `deriveTheme([])` falls back to `"Vegan Favorites"`
  instead of the `"Asian Fusion"` a `Chinese` tag would have produced.
  This is the same bug class documented in tech.spec.md's "Known drift"
  note for `pasta-aglio-e-olio-delux.md`/`tofustroganoff.md` (silently
  wrong parse, not a crash), except those were fixed ad hoc before this
  plan existed and this one wasn't caught until `validate-recipe` ran.
  Two resolutions are both plausible and are a human call, not this
  plan's: (a) collapse the recipe's `tags` onto one line to match every
  other recipe and the parser's actual capability, or (b) teach
  `parseFrontmatter` (and therefore this spec) to support a
  continuation-line array value. Reported per the plan's explicit stop
  condition ("If loader behavior and recipe files disagree on the
  format, record the discrepancy in the plan and STOP") rather than
  decided here.
- 2026-07-17 (resolution): orchestrator ruled for (a) — the recorded
  contract already decided it: recipe-format.spec.md declares
  single-line `key: [...]` arrays normative (the other 17 recipes' and
  the parser's actual shape), and Step 3 explicitly authorizes fixing
  violating recipe files. The tags array was collapsed onto one line,
  content preserved; the parser was left untouched (resolution (b)
  would have been a contract change).

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

`./harness validate-recipe` (no args) over the full 18-file corpus —
fails on the discrepancy above, naming the exact file and reason:

```
$ ./harness validate-recipe
FAIL: /Users/pellefrank/Projects/peralmq/vega-plan-hub/src/data/recipes/vegan-dan-dan-noodles.md: unparseable frontmatter line: "  [\"Chinese\", \"Asian\", \"Noodles\", \"Vegan\", \"Lunch\", \"Dinner\", \"Climate Smart\"]"
$ echo $?
1
```

Confirmed the actual runtime parse result for that file with a standalone
reimplementation of `parseFrontmatter` (identical logic, run outside the
browser/Vite build):

```
$ node -e '<parseFrontmatter reimplementation>; console.log(JSON.stringify(parseFrontmatter(fs.readFileSync("src/data/recipes/vegan-dan-dan-noodles.md","utf8")).frontmatter))'
{"id":"vegan-dan-dan-noodles","title":"Vegan Dan Dan Noodles","imageUrl":"https://javligtgott.se/wp-content/uploads/2020/09/IMG_2020-1024x682-2.jpg","url":"https://javligtgott.se/recept/veganska-dan-dan-nudlar/","cookTime":35,"servings":4,"difficulty":"Medium","tags":""}
```

`tags` is the empty string, not the intended 7-item array — confirms the
silent-drop.

`validate-recipe` works correctly on the other 17 files individually
(spot check on one):

```
$ ./harness validate-recipe src/data/recipes/chana-dal.md
validate-recipe: OK (src/data/recipes/chana-dal.md)
```

Deliberately malformed fixture (`fixtures/recipes/malformed-bad-difficulty.md`,
`difficulty: "Extreme"` — not in the `Easy|Medium|Hard` enum) fails
naming file + field, as Verification requires:

```
$ ./harness validate-recipe fixtures/recipes/malformed-bad-difficulty.md
FAIL: /Users/pellefrank/Projects/peralmq/vega-plan-hub/fixtures/recipes/malformed-bad-difficulty.md: frontmatter.difficulty must be one of Easy|Medium|Hard, got "Extreme"
$ echo $?
1
```

`./harness check` remains green — `validate-recipe` was intentionally
*not* wired into the `check` chain yet, so the corpus-blocking
discrepancy above does not turn the gate red for unrelated work:

```
$ ./harness check
check: deps ... OK (69 deps present)
check: npm run lint ... OK
check: npm test ... OK
check: npm run build ... OK
check: plans --validate ... plans validate: OK (7 plans)
check: OK
```

Remaining work once the human call above lands: fix (or accept) the
`vegan-dan-dan-noodles.md` tags, wire `validate-recipe` into
`check`, rewrite `src/data/recipes/README.md` as a pointer, trim
tech.spec.md's Data model section, and move the `validate-recipe` row in
harness.spec.md from Planned Commands into the command set (update the
Level 2 maturity row too) — all deferred, not done, pending that
decision.

---

After the orchestrator ruling (resolution (a), 2026-07-17) the tags
line was collapsed and the remaining steps completed. Full corpus
green:

```
$ ./harness validate-recipe
validate-recipe: OK (18 recipes)
$ echo $?
0
```

`./harness check` green with validate-recipe wired in as the final
step:

```
$ ./harness check
check: deps ... OK (69 deps present)
check: npm run lint ... OK
check: npm test ... OK
check: npm run build ... OK
check: plans --validate ... plans validate: OK (7 plans)
check: validate-recipe ... validate-recipe: OK (18 recipes)
check: OK
$ echo $?
0
```

Red demo — the exact bug class re-introduced (tags wrapped back onto a
continuation line in `vegan-dan-dan-noodles.md`), `./harness check`
fails at the validate-recipe step naming file + line; note `npm test`
stayed green, proving the validator is the only gate that catches this
silent-drop class:

```
$ ./harness check
check: deps ... OK (69 deps present)
check: npm run lint ... OK
check: npm test ... OK
check: npm run build ... OK
check: plans --validate ... plans validate: OK (7 plans)
check: validate-recipe ... FAIL: /Users/pellefrank/Projects/peralmq/vega-plan-hub/src/data/recipes/vegan-dan-dan-noodles.md: unparseable frontmatter line: "  [\"Chinese\", \"Asian\", \"Noodles\", \"Vegan\", \"Lunch\", \"Dinner\", \"Climate Smart\"]"
$ echo $?
1
```

(File restored afterwards; `./harness validate-recipe` re-verified
green — `OK (18 recipes)`.)

One document defines the format: `src/data/recipes/README.md` is now a
short pointer at `docs/specs/recipe-format.spec.md`, tech.spec.md's
Data model section references it instead of restating it (and the
now-resolved "Known drift" note is gone), and harness.spec.md lists
`validate-recipe [file]` in the command set (removed from Planned
Commands; Level 2 maturity row marked done).
