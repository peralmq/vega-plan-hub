---
id: p1-03-e2e-suite
title: Playwright e2e suite for the core flows; ./harness e2e
phase: P1
status: done
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

- [x] 2026-07-17 auth strategy decided and recorded (Decision Log)
- [x] 2026-07-17 smoke: logged-out user sees Landing; unknown route redirects
- [x] 2026-07-17 flow: plan a week (pick recipes, set multipliers), persists
- [x] 2026-07-17 flow: shopping summary aggregates + copy action works
- [x] 2026-07-17 flow: cook mode shows tonight's meal, scaling updates ingredients
- [x] 2026-07-17 `./harness e2e` wired; docs updated

## Decision Log

- **2026-07-17 — Auth: hermetic Supabase test double (network stub + seeded
  session), not a real test user.** All routes but `/welcome` require a Supabase
  session, and sign-in is Google OAuth only (no email/password), so a "real test
  user" would need an OAuth secret, a seeded database, and network reachability —
  exactly the convenience-over-hermetic trade the harness contract rejects.
  Chosen instead (least invasive to production code, zero runtime changes):
  1. Seed a fake auth session into `localStorage` under `sb-stub-auth-token`
     before the app boots (`context.addInitScript`). supabase-js's
     `getSession()`/init resolves a logged-in user with **no network** when the
     session has a real `user` object and a far-future `expires_at` (verified
     against `@supabase/auth-js` 2.91.1 `_recoverAndRefresh`). The storage-key
     label (`stub`) comes from `VITE_SUPABASE_URL` in `.env.test`
     (`sb-${hostname.split('.')[0]}-auth-token`).
  2. Intercept every PostgREST call (`**/rest/v1/**`) with a small in-memory
     store that honors the exact query shapes the hooks emit (embedded weekly
     fetch, `.maybeSingle()` existence check, insert/delete). `**/auth/v1/**` is
     stubbed defensively. See `e2e/support/mockDb.ts`.
  Each test gets a fresh browser context + fresh `MockDb`, so there is no
  personal account, no secret, no reachable project, and no leftover state.
  **Rejected alternative:** dedicated real Supabase test user — needs a committed
  or env-injected secret, a seeded/cleaned DB, and network access; not
  re-runnable offline; violates "hermetic beats convenient".

- **2026-07-17 — Wiring: `lovable-agent-playwright-config` is unavailable, so
  `playwright.config.ts`/`playwright-fixture.ts` were repointed at the installed
  `@playwright/test`.** The plan's Context assumed the config was "already
  wired", but that package 404s on the pinned public registry and does not
  resolve — the stubs could not load. Since `@playwright/test` is already a
  dependency, the two test-scaffold files now use it directly. This is test
  infrastructure only; no production runtime code changed and no dependency was
  added.

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

Setup (one-time): `npx playwright install chromium`.

### `./harness e2e` — green (from a clean checkout, given `.env.test`)

```
Running 6 tests using 5 workers
  ✓  smoke.spec.ts › logged-out user is redirected to the Landing page (352ms)
  ✓  smoke.spec.ts › unknown route redirects a logged-out user to /welcome (491ms)
  ✓  cook-mode.spec.ts › cook mode shows tonight's meal and scaling updates ingredients (655ms)
  ✓  shopping-summary.spec.ts › shopping summary aggregates ingredients and copy works (625ms)
  ✓  smoke.spec.ts › unknown route redirects a logged-in user to Cook Mode (/) (370ms)
  ✓  plan-week.spec.ts › plan a week: pick recipes, set a multiplier, and persist (1.8s)
  6 passed (7.5s)
```

### Red with a deliberately broken assertion (then reverted)

`cook-mode.spec.ts` "5 servings" → "999 servings":

```
  1) e2e/cook-mode.spec.ts › cook mode shows tonight's meal and scaling updates ingredients
    Error: expect(locator).toBeVisible() failed
    Locator: getByText('999 servings')
    Expected: visible
    Error: element(s) not found
  1 failed
FAIL: e2e: playwright test failed (see the named spec above)
```

### Re-runnable twice in a row (no leftover state)

```
########## RUN 1 ##########   6 passed (7.6s)
########## RUN 2 ##########   6 passed (7.4s)
```

### `./harness check` still green (e2e is NOT part of it)

```
check: deps ... OK (69 deps present)
check: npm run lint ... OK
check: npm test ... OK
check: npm run build ... OK
check: plans --validate ... plans validate: OK (7 plans)
check: validate-recipe ... validate-recipe: OK (18 recipes)
check: OK
```
