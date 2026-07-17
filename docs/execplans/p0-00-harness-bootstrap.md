---
id: p0-00-harness-bootstrap
title: Adopt the portable agentic harness kit (brownfield bootstrap)
phase: P0
status: done
depends_on: []
---

## Goal

Bring vega-plan-hub from maturity Level 0 to Level 1 per
[harness.spec.md](../specs/harness.spec.md): specs in `docs/specs/`, a
green `./harness check` wrapping the real lint and build gates,
schema-validated execplans, thin skills, and a short canonical
`AGENTS.md`. Motivated by the portable kit extracted in
`idiolect/docs/portable/` (README, Adoption → Brownfield).

## Non-goals

- CI workflows (Level 4 — future execplan).
- Writing Playwright or unit tests (`./harness e2e` / `test` stay in the
  Planned Commands table).
- Backfilling past work into execplans.
- Fixing the grandfathered lint violations (list in `eslint.config.js`
  may only shrink, on its own time).

## Context

Before this plan the repo was a Lovable-generated Vite + React 19 + TS
app with no docs/, no tests, no CI, a 650-line style-guide `AGENTS.md`,
and a failing `npm run lint` (6 errors). The portable kit being adopted
lives in `idiolect/docs/portable/` (two specs + two skill templates).

## Progress

- [x] 2026-07-17 specs written (harness, orchestration, conventions)
- [x] 2026-07-17 `./harness` built; lint errors grandfathered per-file
- [x] 2026-07-17 skills copied; `.claude/skills` symlink; AGENTS.md rewritten
- [x] 2026-07-17 verification run; evidence recorded; committed as fe922eb

## Steps

1. Fill and commit `docs/specs/harness.spec.md`,
   `orchestration.spec.md`; distill the old style-guide `AGENTS.md` into
   `conventions.spec.md`.
2. Build `./harness` (zero-dep Node script): `check`, `plans`,
   `plans --validate|--ready|--phase`.
3. Grandfather existing lint errors per-file in `eslint.config.js`.
4. Copy the two skills into `.agents/skills/` with commands filled;
   symlink `.claude/skills`.
5. Rewrite `AGENTS.md` to the kit contract; add `CLAUDE.md` pointer.
6. Seed this plan and validate the backlog with the harness itself.

## Verification

- `./harness check` green end-to-end.
- `./harness plans --validate` / `--ready` / `--phase P0` correct
  against this plan.
- Fail-fast demonstrated: a broken frontmatter file and an injected lint
  error are each named exactly by the failing command.
- `npm run build` unchanged and green.

## Evidence

2026-07-17, bootstrap session.

Baseline before grandfathering: `npm run lint` → 6 errors / 8 warnings
(`no-explicit-any` ×3, `no-empty-object-type` ×2, `no-require-imports`
×1); `npm run build` → `✓ built in 5.49s`. The 6 errors were
grandfathered per-file in `eslint.config.js`.

Plans subcommands (with a throwaway `p0-99-tmp-test` plan depending on
this one, deleted after):

```
$ ./harness plans --ready          # dep not done
no ready plans
$ ./harness plans --ready          # dep done
p0-99-tmp-test  phase=P0  status=todo deps=[p0-00-harness-bootstrap]  Temporary plan for harness verification
$ ./harness plans --validate       # unknown dep
FAIL: .../p0-99-tmp-test.md: depends_on references unknown plan "p9-99-nonexistent"   (exit 1)
$ ./harness plans --validate       # cycle
FAIL: dependency cycle: p0-00-harness-bootstrap -> p0-99-tmp-test -> p0-00-harness-bootstrap   (exit 1)
$ ./harness plans --validate       # bad status
FAIL: .../p0-99-tmp-test.md: status must be one of todo|in-progress|done|deferred, got "bogus"   (exit 1)
$ ./harness plans --phase P0
phase P0: in progress (0/1 done)
```

Fail-fast lint demo (temporary `src/tmp-lint-probe.ts` with an `any`):

```
$ ./harness check
check: npm run lint ... FAIL
.../src/tmp-lint-probe.ts
  1:19  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
FAIL: failing command: npm run lint   (exit 1)
```

Only the probe errored — grandfathering holds, rules stay on for new
code. Final gate after cleanup:

```
$ ./harness check
check: npm run lint ... OK
check: npm run build ... OK
check: plans --validate ... plans validate: OK (1 plan)
check: OK   (exit 0)
```
