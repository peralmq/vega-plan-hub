---
id: p1-04-ci-gate
title: GitHub Actions runs ./harness check on every push and PR
phase: P1
status: in-progress
depends_on: [p1-02-unit-test-suite]
---

## Goal

CI enforcement of the gate: a GitHub Actions workflow that runs
`./harness check` (which by then includes lint, unit tests, build, plan
validation) on every push to main and every PR. Maturity-Level-4 rung in
[harness.spec.md](../specs/harness.spec.md).

## Non-goals

- No e2e in CI yet (needs the p1-03 auth strategy to be hermetic first;
  add as a follow-up plan when that lands).
- No deployment automation (Lovable owns publish).
- No caching micro-optimization beyond `actions/setup-node` npm cache.

## Context

The repo has no `.github/workflows/`. The remote is
`github.com/peralmq/vega-plan-hub` (pushes to `main` are the norm; PRs
exist, e.g. #6, #7). The whole point of `./harness check` being a single
versioned entry point is that CI is a one-liner around it — CI must
never grow its own check logic that could drift from the local gate.

## Progress

- [x] 2026-07-17 workflow file added (checkout, setup-node with npm
      cache, npm ci, ./harness check) — `.github/workflows/check.yml`
- [ ] green run observed on GitHub
- [ ] harness.spec.md maturity table updated (Level 4)

## Steps

1. `.github/workflows/check.yml`: triggers `push` (main) + Node LTS,
   `pull_request`; steps: checkout → setup-node (cache: npm) →
   `npm ci` → `./harness check`.
2. Push, observe the run, link it in Evidence.
3. Update the maturity table.

## Verification

- A green Actions run on GitHub for this plan's own commit.
- A deliberately failing commit (e.g. lint probe) on a branch shows a
  red run naming `npm run lint` in the log, then is dropped.

## Evidence

Local gate before touching CI:

```
$ ./harness check
check: deps ... OK (69 deps present)
check: npm run lint ... OK
check: npm test ... OK
check: npm run build ... OK
check: plans --validate ... plans validate: OK (7 plans)
check: validate-recipe ... validate-recipe: OK (18 recipes)
check: OK
```

Node LTS in CI: 22 (matches local `node -v` → v24.13.0, both satisfy
`actions/setup-node` `node-version: 22`).

Workflow added: `.github/workflows/check.yml` — triggers on `push` to
`main` and on `pull_request`; steps: checkout → setup-node (node 22,
cache: npm) → `npm ci` → `./harness check`.
