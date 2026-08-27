---
id: p4-11-cookmode-deep-links
title: Cook Mode deep links — ?recipe=<id>&x=<multiplier> opens the dish, scaled
phase: P4
status: in-progress
depends_on: [p3-01-kreuzberg-redesign]
---

## Goal

`https://peralmq.github.io/vega-plan-hub/?recipe=mapo-tofu&x=2` opens
Cook Mode with Mapo Tofu selected and ×2 scaling applied. This is the
link target contract the Telegram surfaces need (r1 Script 4's
"[🍳 Cook mode] deep-links with tonight's scaling applied", and every
per-meal link in the p4-10 menu card + PDF). Query params on the
existing `/` route — no new route, no Pages 404 trick needed, since
the base URL serves `index.html` directly.

## Non-goals

- No hash-based routing change; `BrowserRouter` + `basename` stays.
- No shareable public recipe pages: `/` remains auth-gated — the deep
  link lands on `/welcome` for logged-out visitors and must resume
  correctly after login.
- No link generation here — producing the URLs is p4-10's job; this
  plan only makes them land.

## Context

Today recipe selection in `CookMode` is in-page state
(`selectedRecipe`); nothing reads the URL. Contract to implement:
`recipe` = markdown recipe id (unknown id → normal Cook Mode plus a
friendly 🤷 toast, never a crash); `x` = servings multiplier (float,
clamped to the app's allowed range; absent → the planned meal's own
multiplier if the recipe is in the active plan, else 1). The param
must survive the `ProtectedRoute` → `/welcome` → login round-trip
(preserve the full query through the auth redirect). Routes/UX are
spec'd: extend design.spec's Cook Mode row with the deep-link
contract in the same change set (directive Pelle 2026-08-27).

## Progress

- [x] (2026-08-27) Param parsing + selection wiring in CookMode, unit-tested
      (unknown id, bad multiplier, no param)
- [x] (2026-08-27) Auth round-trip preserves the query (e2e)
- [x] (2026-08-27) design.spec Cook Mode row extended with the contract
- [ ] Live: link from a phone opens the scaled recipe on Pages — **not
      done**; requires a deployed Pages build + a phone, which this
      implementer session cannot perform. Leaving `status: in-progress`
      for a human to run this check and flip to `done`.

## Steps

1. Parse `recipe`/`x` in CookMode (or a small hook) and drive the
   existing selection state; toast-and-fallback on unknown ids.
2. Preserve query through `ProtectedRoute`/`AuthRoute` redirects.
3. Update design.spec (Cook Mode capabilities + deep-link contract).
4. Tests: unit for parsing/clamping/fallback; e2e for the logged-in
   happy path and the login round-trip (mock-auth mode, p2-02).

## Verification

- `./harness check` passes; new tests cover unknown id, clamped `x`,
  param-less default, and query survival across the auth redirect.
- Live on Pages: `?recipe=<id>&x=2` from a phone (logged out, then
  logging in) ends on the scaled recipe.

## Evidence

### Files added/changed

- `src/lib/cookModeDeepLink.ts` (new) — pure helpers: `findDeepLinkRecipe`
  (unknown/absent id → `undefined`), `resolveServingsMultiplier` (parses
  `?x`, clamps to `[0.5, 4]` via `clampServingsMultiplier`, falls back to a
  caller-supplied default on absent/empty/unparseable input).
- `src/lib/cookModeDeepLink.test.ts` (new) — unit coverage: known id,
  unknown id, absent param; multiplier clamped up/down, valid float,
  absent → default, unparseable ("banana", "", "NaN") → default.
- `src/pages/CookMode.tsx` — reads `?recipe`/`?x` via `useSearchParams`;
  `deepLinkRecipe` (resolved against `allRecipes`) overrides the
  day-based `selectedRecipe` when present; unknown id fires a
  `🤷 Couldn't find that recipe` toast once and falls through to the
  normal tonight-first view; default multiplier looked up from
  `currentWeekPlan` when `?x` is absent/bad, applied once (via a ref
  guard) after the plan finishes loading so the default reflects real
  plan data rather than a mid-fetch null; the "no meals planned" empty
  state is bypassed when a deep-link recipe is present; the day badge
  reads "🔗 Direct link" instead of "<Day>'s Dinner" when deep-linked.
- `src/App.tsx` — `ProtectedRoute` and `AuthRoute` now redirect with
  `location.search` preserved (`Navigate to={{ pathname, search }}`)
  instead of a bare path, so a deep link's query survives the
  `/` ↔ `/welcome` auth redirects in both directions.
- `src/contexts/AuthContext.tsx` — `signInWithGoogle` now appends
  `window.location.search` to both OAuth `redirectTo`/`redirect_uri`
  targets (GitHub Pages direct-Supabase branch and the Lovable broker
  branch), so the query preserved onto `/welcome` by `ProtectedRoute`
  comes back with the user after the Google round trip.
- `e2e/cook-mode-deep-link.spec.ts` (new) — 6 tests: `?recipe&x` scales
  and overrides the day pick; `?recipe` alone defaults to the active
  plan's multiplier when the recipe is planned, else 1×; unknown id →
  toast + fallback to today's normal pick; bad `?x` → default multiplier,
  no crash; full auth round trip (logged-out deep link → `/welcome` with
  query intact → simulated login + reload → `AuthRoute` bounces back to
  `/` with query intact → recipe shown scaled).
- `docs/specs/design.spec.md` — Cook Mode row in the Screens table
  gained a "deep-linkable via `?recipe=&x=`" note; a new "Cook Mode deep
  links" paragraph after the table spells out the full contract (id
  resolution + fallback, multiplier clamp range and default, no new
  route, query survives the `/welcome`/login round trip).

### `npm test` (new unit tests)

```
$ npx vitest run src/lib/cookModeDeepLink.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)

$ npm test
 Test Files  13 passed (13)
      Tests  269 passed (269)
```

### `npm run lint`

```
$ npm run lint
✖ 9 problems (0 errors, 9 warnings)
```
Same 9 pre-existing warnings as on `main` before this change (verified via
`git stash` diff) — no new warnings or errors introduced. The one warning
inside the touched file (`CookMode.tsx:113`, a `useMemo` missing
`selectedRecipe?.servings` in its deps) pre-dates this plan (was
`CookMode.tsx:79` on `main`); not touched further to stay in scope.

### `./harness e2e` (after `npx playwright install chromium`, which had no
cached browser binary in this environment)

```
$ ./harness e2e
Running 12 tests using 5 workers
  ✓ deep link without ?x defaults to 1x when the recipe isn't in the active plan
  ✓ deep link without ?x defaults to the recipe's multiplier in the active plan
  ✓ unknown recipe id falls back to normal Cook Mode with a friendly toast, never a crash
  ✓ deep link with ?x opens the recipe scaled, overriding the day pick
  ✓ a bad ?x value falls back to the default multiplier instead of crashing
  ✓ smoke: auth gating › logged-out user is redirected to the Landing page
  ✓ the query survives the ProtectedRoute -> /welcome -> login round trip
  ✓ smoke: auth gating › unknown route redirects a logged-out user to /welcome
  ✓ smoke: auth gating › unknown route redirects a logged-in user to Cook Mode (/)
  ✓ shopping summary aggregates ingredients and copy works
  ✓ cook mode shows tonight's meal and scaling updates ingredients
  ✓ plan a week: pick recipes, set a multiplier, and persist
  12 passed (8.5s)
```

### `./harness check`

```
$ ./harness check
check: deps ... OK (73 deps present)
check: npm run lint ... OK
check: npm test ... OK
check: npm run build ... OK
check: tsc bot ... OK
check: tsc compare ... OK
check: plans --validate ... plans validate: OK (28 plans)
check: validate-recipe ... validate-recipe: OK (30 recipes)
check: OK
```

### Not done: live Pages verification

The plan's Verification bullet "Live on Pages: `?recipe=<id>&x=2` from a
phone (logged out, then logging in) ends on the scaled recipe" requires a
deployed GitHub Pages build and a physical phone — not available to this
implementer session. `status` is left `in-progress`; a human should run
this check against the deployed site and flip to `done`.

### Residual contract risk

- The Google OAuth redirect URL allowlist on the Supabase project side is
  configured outside this repo. `signInWithGoogle` now appends a query
  string to `redirectTo`/`redirect_uri`; if Supabase's redirect-URL
  allowlist for this project matches by exact string rather than by
  prefix, appending `?recipe=...&x=...` could be rejected by Supabase at
  OAuth-initiation time. This can only be confirmed live (the unticked
  Verification bullet above) and is the main risk this change carries
  into that live check.
- Supabase's own OAuth callback params (e.g. a PKCE `?code=...`) get
  appended to whatever `redirectTo` we pass; this hasn't been observed
  live, so there's a small chance of a `?code=...&recipe=...&x=...`
  malformed-query edge case if Supabase doesn't merge query strings
  cleanly. Also only observable live.
- The deep-linked recipe permanently overrides the day-based pick for the
  lifetime of that page load (clicking a different day in the strip while
  a deep link is active does not currently un-override it, since there is
  no in-app UI that changes `?recipe=`). Not required by the plan's
  contract, which only specifies the initial "opens Cook Mode with X
  selected" landing behavior; flagged here as a UX nuance, not a bug.
