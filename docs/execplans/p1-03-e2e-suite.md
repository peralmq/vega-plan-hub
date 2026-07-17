---
id: p1-03-e2e-suite
title: Playwright e2e suite for the core flows; ./harness e2e
phase: P1
status: todo
depends_on: [p1-01-spec-extraction]
---

## Goal

An `e2e/` Playwright suite covering the product's core loop —
welcome → sign-in → plan a week → shopping summary → cook mode — plus an
on-demand `./harness e2e` command. Maturity-Level-3 rung
(deterministic end-to-end smoke) in
[harness.spec.md](../specs/harness.spec.md).

## Non-goals

- Not part of `./harness check` (too slow for the always-on gate).
- No cross-browser matrix; one chromium project is enough.
- No visual-regression screenshots in this plan.

## Context

`playwright.config.ts` already wires `lovable-agent-playwright-config`
(tests live in `e2e/`, fixture re-exported from
`playwright-fixture.ts`), and `@playwright/test` is installed — only the
tests and the harness command are missing. The hard problem is **auth**:
all routes but `/welcome` require a Supabase session
([tech.spec.md](../specs/tech.spec.md)). Decide during implementation,
recording the choice in the Decision Log: a dedicated test user against
a real Supabase project (simplest, but needs a secret in env and a
seeded/cleaned DB) vs. mocking the Supabase client at the network layer
(hermetic, more setup). Hermetic beats convenient if both are viable —
the harness contract prefers offline-deterministic checks.

## Progress

- [ ] auth strategy decided and recorded (Decision Log)
- [ ] smoke: logged-out user sees Landing; unknown route redirects
- [ ] flow: plan a week (pick recipes, set multipliers), persists
- [ ] flow: shopping summary aggregates + copy action works
- [ ] flow: cook mode shows tonight's meal, scaling updates ingredients
- [ ] `./harness e2e` wired; docs updated

## Decision Log

(auth strategy recorded here during implementation)

## Steps

1. Resolve the auth strategy (above); wire any env needs through
   `.env.example`, never committed secrets.
2. Write the smoke test first (landing renders, redirects work) to
   prove the pipeline; then the three flow tests.
3. Add `./harness e2e` (runs `npx playwright test`, passes exit code
   through, names the failing spec on failure).
4. Update harness.spec.md: Planned Commands row → command set; maturity
   table Level 3 status.

## Verification

- `./harness e2e` green locally from a clean checkout (given documented
  env), red with a deliberately broken assertion (transcript in
  Evidence, then removed).
- The suite does not depend on the developer's personal account or
  leftover DB state (re-runnable twice in a row).

## Evidence

(appended during implementation)
