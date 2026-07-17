---
id: p2-02-mock-auth-mode
title: Mock-auth mode - browse authed views without an account
phase: P2
status: done
depends_on: [p1-03-e2e-suite]
---

## Goal

Make the auth-gated views (Cook Mode `/`, Plan Mode `/plan`, Shopping
Summary `/summary`, Account `/account`) reachable in a browser without a
real account, so humans can visually verify them (the step that blocked
`p2-01-dependency-updates`' final sign-off) and future checks can drive
them. Concretely: `./harness dev-mock` starts the app with a mock
signed-in session and seeded in-memory data — no Google OAuth, no
Supabase network, no secrets.

## Non-goals

- No real dedicated test account (sign-in is Google-OAuth-only; a test
  account would need OAuth secrets + seeded cloud state — the
  convenience-over-hermetic trade this repo's contracts reject; recorded
  here as the rejected alternative).
- No change to real auth flows or to production behavior — the mock
  must be statically eliminated from production builds (see Context).
- No rewrite of the e2e suite to use this mode (its network-level
  interception is more realistic; leave it).
- No persistence in mock mode (in-memory per page load is fine).

## Context

All routes but `/welcome` require a Supabase session
(`src/contexts/AuthContext.tsx`; `ProtectedRoute` in `src/App.tsx`).
Data flows through hooks (`useMealPlanDB`, `useFamilyMembers`,
`useRecipeRatings`, `useRecipeComments`) that call the client exported
from `src/integrations/supabase/client.ts` — that single export is the
one seam through which every Supabase call passes.

The e2e suite (p1-03) already proved the mock approach at the network
layer: a fake session object satisfies `@supabase/auth-js` with no
network call, and `e2e/support/mockDb.ts` emulates the exact PostgREST
query shapes the hooks emit (embedded weekly fetch, `.maybeSingle()`,
insert/delete). This plan moves an equivalent mock inside the app behind
a build-time flag.

Safety mechanism (the load-bearing design constraint): gate on
`import.meta.env.VITE_MOCK_AUTH` — Vite statically replaces
`import.meta.env.*` at build time, so when the flag is unset the mock
branch is dead code and is eliminated from the production bundle. The
mock client lives in its own module and must only be reachable through
that statically-analyzable condition. Lovable's production publish never
sets the flag.

Recipe ids for seed data come from `src/data/recipes/` via the existing
`loadAllRecipes()`; seed a full current week + partial next week with
varied `servings_multiplier` so all three views render meaningful state.

## Progress

- [x] mock client module (auth surface: getSession /
      onAuthStateChange / signOut; data surface: the query shapes the
      four hooks emit) behind `VITE_MOCK_AUTH`
- [x] seeded in-memory data (current + next week plans, a family
      member, a rating, a comment) using real recipe ids
- [x] `./harness dev-mock` command (vite dev server with the flag set;
      prints the URL and a "mock mode - not production" banner note)
- [x] visible in-app indicator when mock mode is active (small badge,
      so a screenshot can never be mistaken for real data)
- [x] production-elimination proof: `npm run build` WITHOUT the flag,
      then grep the dist bundle for a mock-only sentinel string - must
      be absent (add this as a unit-testable or scriptable check in the
      Evidence, and wire it into the existing build step of
      `./harness check` only if cheap; otherwise record the manual
      command)
- [x] docs: tech.spec.md Commands + Testing strategy updated (this
      edit is pre-authorized by this plan)

## Steps

1. Extract/adapt the mock data emulation from `e2e/support/mockDb.ts`
   into `src/mocks/` (app-side; keep the e2e copy untouched).
2. In `src/integrations/supabase/client.ts`, export the mock client
   when `import.meta.env.VITE_MOCK_AUTH === "true"`, the real one
   otherwise — keeping the module's public surface identical.
3. Add the mock-mode badge (small fixed-position element rendered only
   in mock mode).
4. Add `./harness dev-mock` (sets the env var, runs `vite`), plus the
   dist-grep elimination proof.
5. Verify all four authed views render and are interactive with seeded
   data; record Evidence.

## Verification

- `./harness dev-mock` → browsing `/`, `/plan`, `/summary`, `/account`
  works without any sign-in; seeded meals visible; mock badge shown.
- Planning interactions work in-memory (pick a recipe, change a
  multiplier, see it reflected in summary).
- `npm run build` without the flag: dist bundle contains no mock
  sentinel string (transcript in Evidence).
- `./harness check` and `./harness e2e` remain green (e2e still uses
  its own network mocks, unaffected).

## Evidence

### Files added/changed

- `src/mocks/mockStore.ts` — in-memory PostgREST-shaped emulation
  (`MockStore` + `MockQueryBuilder`), adapted from `e2e/support/mockDb.ts`'s
  query-shape logic but reworked to run in-process (no HTTP interception).
  No top-level side effects — everything lives in class methods, invoked
  only from `mockClient.ts`, which keeps it eligible for Rollup dead-code
  elimination.
- `src/mocks/seedData.ts` — `seedMockStore()`: full current week (Mon-Sun,
  varied `servings_multiplier` 1/1.5/2), partial next week (3 days, one at
  3×), one family member, one rating, one comment — using real ids from
  `loadAllRecipes()`.
- `src/mocks/mockClient.ts` — `createMockClient()`: `MockAuth` class
  (`getSession`/`onAuthStateChange`/`signOut`/`signInWithOAuth`) + `from()`
  wired to `MockStore`. Contains `MOCK_AUTH_SENTINEL = "MOCK_AUTH_MODE_ACTIVE"`,
  logged via `console.info` inside `createMockClient()` — this both banners
  mock mode in the browser console and anchors the sentinel as a real
  usage, so its absence from a flag-unset build is a meaningful signal
  rather than an unused-export accident.
- `src/mocks/MockModeBadge.tsx` — fixed-position badge, rendered from
  `src/App.tsx` only when `import.meta.env.VITE_MOCK_AUTH === 'true'`.
- `src/integrations/supabase/client.ts` — `supabase` export now a ternary
  on `import.meta.env.VITE_MOCK_AUTH === 'true'` (`createMockClient()` vs
  the untouched real `createClient(...)` call), cast to
  `SupabaseClient<Database>` so hook call sites need no changes.
- `src/App.tsx` — imports and conditionally renders `MockModeBadge`.
- `harness` — new `dev-mock` case: prints a "MOCK AUTH MODE" banner, then
  `execSync("npx vite", { env: { ...process.env, VITE_MOCK_AUTH: "true" } })`
  with stdio inherited; SIGINT/Ctrl-C exit is swallowed (not a harness
  failure). Usage line updated.
- `docs/specs/tech.spec.md` — Commands block gained `./harness dev-mock`;
  Testing strategy gained a "Mock-auth mode" bullet distinguishing it from
  the e2e suite (manual-verification aid, not a hermetic automated check).

### `./harness check`

```
$ ./harness check
check: deps ... OK (69 deps present)
check: npm run lint ... OK
check: npm test ... OK
check: npm run build ... OK
check: plans --validate ... plans validate: OK (8 plans)
check: validate-recipe ... validate-recipe: OK (18 recipes)
check: OK
```

### `./harness e2e`

```
$ ./harness e2e
Running 6 tests using 5 workers
  ✓ smoke: auth gating › unknown route redirects a logged-out user to /welcome
  ✓ smoke: auth gating › logged-out user is redirected to the Landing page
  ✓ shopping summary aggregates ingredients and copy works
  ✓ cook mode shows tonight's meal and scaling updates ingredients
  ✓ smoke: auth gating › unknown route redirects a logged-in user to Cook Mode (/)
  ✓ plan a week: pick recipes, set a multiplier, and persist
  6 passed (6.0s)
```
Confirms the e2e suite's own network-level mock (`e2e/support/mockDb.ts`)
is unaffected by this change.

### Production-elimination proof

```
$ rm -rf dist && npm run build
dist/assets/index-D8YzENTy.js   764.10 kB │ gzip: 219.68 kB
✓ built in 486ms

$ grep -rn "MOCK_AUTH_MODE_ACTIVE" dist/
(no output — exit code 1)

$ grep -rlE "createMockClient|MockStore|Mock Chef|mock-chef@vega" dist/
(no output — exit code 1)
```

Control case — same build with the flag set (to a throwaway `outDir`, not
committed), confirming the mechanism actually discriminates rather than the
string being absent by coincidence:

```
$ VITE_MOCK_AUTH=true npx vite build --outDir dist-mock-check
dist-mock-check/assets/index-vBBKU_jR.js   568.16 kB │ gzip: 170.08 kB
✓ built in 437ms

$ grep -rn "MOCK_AUTH_MODE_ACTIVE" dist-mock-check/
dist-mock-check/assets/index-vBBKU_jR.js:927:...MOCK_AUTH_MODE_ACTIVE...
(exit code 0 — match found, as expected)

$ rm -rf dist-mock-check   # cleanup, not committed
```

Note the mock-enabled bundle (568 KB) is *smaller* than the production one
(764 KB): with the flag true, the real `createClient(...)` branch (and the
`@supabase/supabase-js` realtime/websocket machinery it pulls in
transitively) becomes the dead branch and is eliminated instead — a second,
independent confirmation that the ternary is genuinely being folded and
tree-shaken by Rollup, not just "the sentinel happens not to appear."

### Manual browser verification (`./harness dev-mock`, driven via the
Claude Browser tool against `VITE_MOCK_AUTH=true npx vite --port 8081`
since the harness command itself blocks in the foreground)

- **`/` (Cook Mode)** — loads immediately, no sign-in prompt. Shows
  "Saturday's Dinner: Maa Ki Dal – Black Lentil Dal" (today's seeded
  recipe) with full ingredients/instructions, a working servings
  multiplier, and the 7-day week strip (🍲 on every day). Mock badge
  visible bottom-right.
- **`/plan` (Plan Mode)** — defaults to "Week of Jul 20" (next week, since
  today is past this week's cutoff), shows the 3 seeded meals (Masoor Dal
  1×, Palak Paneer 1×, Pasta Aglio E Olio Delux 3×) and 4 empty
  "Add Dinner" slots. Clicking "Add Dinner" → Thursday opened a recipe
  picker (18 recipes, all real markdown content); selecting "Chili Sin
  Carne with Chipotle" showed a toast ("Added! ✨ ... on Thursday"),
  updated the day card, and bumped the Week Summary (3→4 meals, 85→145
  min, 40→68 ingredients) — proving the in-memory write path
  (insert/select/eq/maybeSingle chains) works. Clicking "Save & Get
  Shopping List" persisted it (insert plan + delete/insert daily_meals)
  and navigated to Shopping Summary with the new recipe's ingredients
  included — proving round-trip persistence through the mock query
  builder.
- **`/summary` (Shopping Summary)** — after the save above: "Meal Plan
  Saved! Your Week of Jul 20 plan is ready", a 55-item aggregated
  ingredient list (correctly scaled/merged across recipes, e.g. "×2
  recipes" annotations, 3× multiplier reflected in "1.5 kg spaghetti"),
  and the 4 planned-meal cards. Mock badge visible.
- **`/account` (Account)** — shows "Mock Chef 🧑‍🍳" / "mock-chef@vega.local",
  a Family Members section with the seeded "Mock Kid 🧒" member, and a
  working "Sign Out" button. Mock badge visible.
- Console showed `[MOCK_AUTH_MODE_ACTIVE] mock Supabase client created —
  seeded, in-memory, not production.` on load, and no errors other than a
  pre-existing, unrelated warning about empty recipe `imageUrl`s (present
  before this change; not something this plan touches).
- Dev server was foregrounded for the harness-command shape, then killed
  before handoff (`pkill -f "vite --port 8081"`).
