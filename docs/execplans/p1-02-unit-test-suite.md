---
id: p1-02-unit-test-suite
title: Vitest unit suite for the pure core; ./harness test joins the gate
phase: P1
status: todo
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

- [ ] vitest installed and configured (shares vite config)
- [ ] normalization tests (aliases, aggregation across recipes)
- [ ] scaling tests (unit conversion, multipliers, edge quantities)
- [ ] recipeLoader tests (parses all committed recipes; rejects malformed)
- [ ] `./harness test` added; joins `./harness check`
- [ ] specs updated: Planned Commands row moved to command set

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
- All 19 committed recipes pass the loader tests.
- Evidence includes the red→green transcript for at least one
  scaling bug-shaped case.

## Evidence

(appended during implementation)
