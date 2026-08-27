---
id: p1-06-lint-warning-baseline
title: ./harness check enforces a ratcheted lint-warning baseline
phase: P1
status: done
depends_on: [p1-04-ci-gate]
---

## Goal

`./harness check`'s lint step fails when the eslint warning count exceeds
a committed baseline; the baseline may only shrink (ratchet), the same
policy already governing the grandfathered exceptions list in
`eslint.config.js`. Closes a gap surfaced in this session's
retrospective: an implementer had to hand-verify "no new lint warnings
vs main" via `git stash` because the harness could not answer that
deterministically.

## Non-goals

- Not a new harness command — `docs/specs/harness.spec.md`'s command
  list is unchanged. This strengthens the existing `check: npm run lint`
  step inside `./harness check`, so the spec's Command Set section does
  not need editing.
- Not fixing the 8 pre-existing warnings — they are legitimate
  `react-refresh/only-export-components` findings in shadcn/ui
  boilerplate files (constants co-exported alongside components) and
  `src/contexts/AuthContext.tsx`. Fixing them is separate, optional
  follow-up work; this plan only stops the count from growing.
- No change to `eslint.config.js`'s grandfathered `no-explicit-any` /
  `no-empty-object-type` exceptions (a different, already-enforced
  ratchet, left untouched).

## Context

`eslint . ` exits non-zero only when it reports **errors**; a
warnings-only run exits 0. `./harness check`'s lint step was a plain
pass/fail wrapper around `npm run lint --silent`
(`["npm run lint", "npm run lint --silent"]` in the `steps` array), so it
could never catch a rising warning count — only actual lint errors. This
session an implementer needed to confirm "no new lint warnings vs main"
by hand: `git stash`, re-run lint on the clean tree, compare counts,
`git stash pop`. That comparison is exactly the kind of deterministic
question the harness should answer (`AGENTS.md` self-improvement rule,
`docs/specs/harness.spec.md`'s "gap a deterministic check could have
caught" trigger).

Baseline value: running `npx eslint .` on `main` at the time of writing
reports `✖ 8 problems (0 errors, 8 warnings)` — all
`react-refresh/only-export-components` warnings in
`src/components/ui/{badge,button,form,navigation-menu,sidebar,sonner,toggle}.tsx`
and `src/contexts/AuthContext.tsx`. The harness hard-codes this as
`LINT_WARNING_BASELINE = 8`.

## Progress

- [x] 2026-08-27 confirmed current warning count: `npx eslint .` → 8
      warnings, 0 errors
- [x] 2026-08-27 added `LINT_WARNING_BASELINE` constant and `checkLint()`
      to `./harness`, wired into `check()` in place of the old
      pass/fail-only lint step
- [x] 2026-08-27 green run at baseline 8 captured
- [x] 2026-08-27 red run captured by temporarily lowering the baseline to
      7 (real count still 8), confirmed specific failure message and
      non-zero exit, then restored to 8
- [x] 2026-08-27 `./harness check` green on the restored tree; plan
      marked done

## Steps

1. Run `npx eslint .` on a clean `main` tree to get the exact current
   warning count (not the number quoted in this plan's originating
   conversation — verify it fresh).
2. In `./harness`, add `LINT_WARNING_BASELINE` as a top-level constant
   with a comment stating the ratchet rule, and a `checkLint()` function
   that: runs `npx eslint .` capturing stdout; if eslint throws (lint
   *errors* present), fails immediately the same way the old step did;
   otherwise parses the `✖ N problems (E errors, W warnings)` summary
   line for the warning count and fails with a message naming both the
   actual and allowed count when it exceeds the baseline.
3. Wire `checkLint()` into `check()` in place of the old
   `["npm run lint", "npm run lint --silent"]` entry in the generic
   `steps` array, keeping the `check: npm run lint ... ` label so
   existing log-reading habits (e.g. `p1-04-ci-gate`'s CI log excerpts)
   still line up.
4. Prove both directions: green at the real baseline, then red by
   temporarily editing the constant down by one (cheaper and more
   deterministic than manufacturing a throwaway warning), capturing the
   exact failure text and exit code, then restore.
5. Record both runs in Evidence, tick Progress, set status `done`.

## Verification

- `./harness check` passes on the unmodified tree, and its lint line
  reports the count against the baseline (e.g. `OK (8/8 warnings)`).
- Temporarily setting `LINT_WARNING_BASELINE` below the real warning
  count makes `./harness check` exit non-zero with a message naming both
  the actual warning count and the configured baseline, without touching
  any other check step.
- `git diff` for this change touches only `harness` and this plan file —
  no spec, no other source file.

## Evidence

Baseline count on the clean tree, before touching the harness:

```
$ npm run lint --silent
... (8 react-refresh/only-export-components warnings) ...
✖ 8 problems (0 errors, 8 warnings)
$ echo $?
0
```

Confirms the gap: eslint's own exit code is 0 here — a plain
pass/fail wrapper around `npm run lint` cannot detect this count rising.

Green run at `LINT_WARNING_BASELINE = 8` (the shipped value):

```
$ ./harness check
check: deps ... OK (73 deps present)
check: npm run lint ... OK (8/8 warnings)
check: npm test ... OK
check: npm run build ... OK
check: tsc bot ... OK
check: tsc compare ... OK
check: plans --validate ... plans validate: OK (28 plans)
check: validate-recipe ... validate-recipe: OK (30 recipes)
check: OK
$ echo $?
0
```

Red run, `LINT_WARNING_BASELINE` temporarily edited to `7` (one below
the real count of 8), tree otherwise unchanged:

```
$ ./harness check
check: deps ... OK (73 deps present)
check: npm run lint ...
... (eslint's normal warning listing) ...
✖ 8 problems (0 errors, 8 warnings)
FAIL: lint warnings: 8 exceeds baseline 7 (LINT_WARNING_BASELINE in
./harness, docs/execplans/p1-06-lint-warning-baseline.md) — fix the new
warning(s); the baseline may only shrink, never grow
$ echo $?
1
```

Constant restored to `8`; `./harness check` re-run green (exit 0),
identical to the first green run above. `git diff harness` after
restoring shows only the intended additions (the `LINT_WARNING_BASELINE`
constant, `checkLint()`, and its call site in `check()`) — no leftover
`7`.
