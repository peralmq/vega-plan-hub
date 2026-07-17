---
id: p1-04-ci-gate
title: GitHub Actions runs ./harness check on every push and PR
phase: P1
status: done
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
- [x] 2026-07-17 green run observed on GitHub —
      https://github.com/peralmq/vega-plan-hub/actions/runs/29615230973
      (commit 527cb69)
- [x] 2026-07-17 red run observed on a throwaway PR/branch, naming
      `npm run lint` as the failing command; branch deleted after —
      https://github.com/peralmq/vega-plan-hub/actions/runs/29615338967
- [x] 2026-07-17 harness.spec.md maturity table updated (Level 4)

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

Green run (commit `527cb69`, pushed directly to `main`):

```
$ git push origin main
$ gh run watch 29615230973 --exit-status
✓ main check · 29615230973
JOBS
✓ check in 36s (ID 87998758180)
  ✓ Set up job
  ✓ Run actions/checkout@v4
  ✓ Run actions/setup-node@v4
  ✓ Run npm ci
  ✓ Run ./harness check
  ✓ Post Run actions/setup-node@v4
  ✓ Post Run actions/checkout@v4
  ✓ Complete job
EXIT: 0
```
URL: https://github.com/peralmq/vega-plan-hub/actions/runs/29615230973

Red run (throwaway branch `ci-red-probe-p1-04`, commit `0438f9f`: a
one-line syntax error injected into `src/main.tsx` —
`const ciRedProbeSyntaxError = ;` — to force a lint failure).
Reproduced locally first:

```
$ ./harness check
check: deps ... OK (69 deps present)
check: npm run lint ... FAIL
FAIL: failing command: npm run lint
...
/Users/.../src/main.tsx
  2:30  error  Parsing error: Expression expected
...
```

Then opened PR #8 (`pull_request` is the only trigger that fires for a
non-`main` branch under this workflow's `push: branches: [main]`
filter) and watched the run:

```
$ gh pr create --title "CI red-run probe (throwaway, p1-04)" ... \
    --head ci-red-probe-p1-04 --base main
https://github.com/peralmq/vega-plan-hub/pull/8
$ gh run watch 29615338967
X ci-red-probe-p1-04 check peralmq/vega-plan-hub#8 · 29615338967
JOBS
X check in 17s (ID 87999094249)
  ✓ Set up job
  ✓ Run actions/checkout@v4
  ✓ Run actions/setup-node@v4
  ✓ Run npm ci
  X Run ./harness check
  - Post Run actions/setup-node@v4
  ✓ Post Run actions/checkout@v4
X Process completed with exit code 1.
```

Log excerpt naming the failing command
(`gh run view 29615338967 --log-failed`):

```
check	Run ./harness check	2026-07-17T21:37:52.7318571Z check: deps ... OK (69 deps present)
check	Run ./harness check	2026-07-17T21:37:54.6663115Z check: npm run lint ... FAIL
check	Run ./harness check	2026-07-17T21:37:54.6663866Z FAIL: failing command: npm run lint
check	Run ./harness check	.../src/main.tsx
check	Run ./harness check	  2:30  error  Parsing error: Expression expected
```
URL: https://github.com/peralmq/vega-plan-hub/actions/runs/29615338967

Cleanup: `gh pr close 8 --delete-branch` (closed PR #8, deleted
`ci-red-probe-p1-04` on origin and locally); confirmed with
`git ls-remote --heads origin ci-red-probe-p1-04` (empty) and
`git fetch --prune origin`.
