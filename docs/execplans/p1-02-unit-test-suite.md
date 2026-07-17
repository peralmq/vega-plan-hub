---
id: p1-02-unit-test-suite
title: Vitest unit suite for the pure core; ./harness test joins the gate
phase: P1
status: done
depends_on: [p1-01-spec-extraction]
---

## Goal

A Vitest + React Testing Library setup with meaningful coverage of the
pure logic core, and a `./harness test` command that joins
`./harness check`. This is the maturity-Level-2 rung in
[harness.spec.md](../specs/harness.spec.md).

## Non-goals

- No component/page snapshot tests in this plan (low value, high churn).
- No e2e tests (that is `p1-03-e2e-suite`).
- No coverage-percentage gate yet (a later ratchet once a baseline
  exists).

## Context

The repo has zero tests. The highest-value pure targets
([tech.spec.md](../specs/tech.spec.md), Testing strategy):
`src/lib/ingredientNormalization.ts` (alias merging, aggregation),
`src/lib/ingredientScaling.ts` (unit-group conversion, servings
multiplier), and `src/services/recipeLoader.ts` (frontmatter + ingredient
*table* parsing — every committed recipe file is a free fixture). Vitest
is the natural runner in a Vite app and shares its config. Adding
`vitest` (and RTL when needed) is a new dev dependency — flag it in the
handoff per AGENTS.md ("adding a dependency" is an escalation trigger;
this plan is the pre-approval once a human approves the plan itself).

## Progress

- [x] 2026-07-17 vitest installed and configured (shares vite config)
- [x] 2026-07-17 normalization tests (aliases, aggregation across recipes)
- [x] 2026-07-17 scaling tests (unit conversion, multipliers, edge quantities)
- [x] 2026-07-17 recipeLoader tests (parses all committed recipes; rejects malformed)
- [x] 2026-07-17 `./harness test` added; joins `./harness check`
- [x] 2026-07-17 specs updated: Planned Commands row moved to command set

## Steps

1. Add `vitest` dev dependency and a `test` npm script; wire
   `./harness test` to it.
2. Test-first over `src/lib/ingredientScaling.ts` and
   `ingredientNormalization.ts`: table-driven cases for conversions,
   aliases, aggregation, and the known-tricky empty-quantity rows
   ("garam masala — to serve").
3. `recipeLoader` tests: load every `src/data/recipes/*.md` and assert
   schema completeness (doubles as recipe validation until
   `validate-recipe` lands); explicit malformed-input cases.
4. Add the `test` step to `./harness check` (after lint, before build)
   and update harness.spec.md's command set + maturity table (Level 2).

## Verification

- `./harness test` runs the suite standalone; `./harness check` fails
  when a unit test fails (demonstrate with a deliberately broken test,
  then remove it).
- All committed recipes pass the loader tests. (Correction during
  implementation: the repo currently has 18 recipe files, not 19 as
  stated when this plan was written — `tech.spec.md`'s recipe count was
  stale relative to the latest recipe-content commits. The loader test
  asserts against the live file count via `readdirSync`, not a hardcoded
  number, so it stays correct as recipes are added. `tech.spec.md` has
  been corrected to 18 in the same change set.)
- Evidence includes the red→green transcript for at least one
  scaling bug-shaped case.

## Evidence

### vitest install + config

```
$ npm install --save-dev vitest
added 36 packages, changed 4 packages, and audited 431 packages in 9s
```

Added `vitest.config.ts` (standalone, not merged into `vite.config.ts` —
the pure lib/service core under test needs only module resolution +
`import.meta.glob`, not the React/lovable-tagger plugin chain) and a
`test` npm script (`vitest run`).

### Red → green: `formatQuantity` closest-fraction bug (ingredientScaling.ts)

`formatQuantity` scans a fixed-order fraction table and returns the
*first* candidate within a 0.05 tolerance rather than the *closest* one.
A decimal like 0.6667 is within tolerance of both 5/8 (0.625, diff
0.0417) and 2/3 (0.666, diff 0.0007) — the buggy code returned "5/8".
This is reachable from `scaleIngredient`: doubling "1 tsp" (servings 4 →
8) converts to 2 tsp, `optimizeUnit` promotes it to ~0.667 tbsp, and the
mislabeled fraction surfaced as "5/8 tbsp" instead of "2/3 tbsp".

Red (test written first, against the unfixed implementation):

```
$ npx vitest run src/lib/ingredientScaling.test.ts
 ❯ src/lib/ingredientScaling.test.ts (23 tests | 2 failed) 8ms
     × picks the closest matching fraction, not the first one within tolerance
     × formats a doubled small quantity with the closest fraction after unit optimization

 FAIL  src/lib/ingredientScaling.test.ts > formatQuantity > picks the closest matching fraction, not the first one within tolerance
AssertionError: expected '2 5/8' to be '2 2/3'
 FAIL  src/lib/ingredientScaling.test.ts > scaleIngredient > formats a doubled small quantity with the closest fraction after unit optimization
AssertionError: expected { quantity: '5/8', unit: 'tbsp', … } to deeply equal { quantity: '2/3', unit: 'tbsp', … }

 Test Files  1 failed (1)
      Tests  2 failed | 21 passed (23)
```

Fix applied to `src/lib/ingredientScaling.ts` `formatQuantity`: track the
closest fraction match by diff instead of returning the first one under
tolerance.

Green:

```
$ npx vitest run src/lib/ingredientScaling.test.ts
 Test Files  1 passed (1)
      Tests  23 passed (23)
```

### Real recipe-data defects the loader tests caught

Writing `recipeLoader.test.ts` against every committed recipe file
(rather than fixtures) surfaced two recipes silently parsing to zero
ingredients because they used the old list-based ingredient format
instead of the documented markdown-table format
(`docs/specs/tech.spec.md`, "Known drift" callout):

- `src/data/recipes/pasta-aglio-e-olio-delux.md` — list-format
  ingredients (`- 12 garlic cloves`, …) parsed to `[]`; multi-line
  `tags:` YAML also parsed to `''` (the hand-rolled frontmatter parser
  only handles single-line arrays). A near-duplicate,
  `deluxe-aglio-e-olio.md`, already existed in correct table format and
  was used as the conversion template.
- `src/data/recipes/tofustroganoff.md` — list-format ingredients
  (including a `### For serving` sub-heading) parsed to `[]`. Converted
  to the table format by hand, preserving every ingredient, quantity,
  and note.

Both files now parse with non-empty ingredients; content/wording was
preserved, only structure changed. Confirmed no other recipe file uses
the list format:

```
$ for f in src/data/recipes/*.md; do
    [ "$(basename $f)" = "README.md" ] && continue
    awk '/^## Ingredients/{flag=1;next}/^## /{flag=0}flag' "$f" | grep -q '^|' || echo "NO TABLE: $f"
  done
(no output)
```

### Full suite green

```
$ npm run test
 RUN  v4.1.10 /Users/pellefrank/Projects/peralmq/vega-plan-hub
 Test Files  3 passed (3)
      Tests  68 passed (68)
```

### `./harness test` (new standalone command)

```
$ ./harness test
 Test Files  3 passed (3)
      Tests  68 passed (68)
```

### `./harness check` — deliberately broken test proves the gate catches red

Appended a sentinel test asserting a wrong value, then ran `./harness
check`:

```
$ ./harness check
check: deps ... OK (69 deps present)
check: npm run lint ... OK
check: npm test ... FAIL

 ❯ src/lib/ingredientScaling.test.ts (24 tests | 1 failed) 9ms
     × fails on purpose to prove ./harness check catches a red suite
AssertionError: expected '1/2' to be 'this is deliberately wrong'

 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 68 passed (69)
FAIL: failing command: npm test
```

Removed the sentinel test; `./harness check` back to green:

```
$ ./harness check
check: deps ... OK (69 deps present)
check: npm run lint ... OK
check: npm test ... OK
check: npm run build ... OK
check: plans --validate ... plans validate: OK (7 plans)
check: OK
```
