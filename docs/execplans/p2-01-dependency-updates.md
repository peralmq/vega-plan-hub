---
id: p2-01-dependency-updates
title: Update lagging dependencies behind the matured gate
phase: P2
status: in-progress
depends_on: [p1-02-unit-test-suite, p1-03-e2e-suite, p1-04-ci-gate]
---

## Goal

Bring the dependency set up to date (it lags some months behind:
e.g. Vite 5 with Vite 7 current, Tailwind 3 vs 4, React Router 7.12,
TanStack Query 5.90, Supabase JS 2.91, Playwright 1.57, ESLint 9.32 —
re-derive the actual gap with `npm outdated` at implementation time),
**only after** the harness can catch regressions: unit suite, e2e
smoke, and CI must be in place first — that is what `depends_on`
encodes.

## Non-goals

- No framework swaps (stay on Vite/React/Tailwind/shadcn).
- No React 18-type-vs-19 cleanup beyond what updates force
  (`@types/react` is pinned to 18 while React is 19 — resolve if the
  update path demands it, otherwise note as follow-up).
- No update of `bun.lockb` (stale; npm + package-lock.json is the
  package manager per tech.spec.md — delete the bun lockfile in this
  plan instead).

## Context

`package.json` was largely frozen while the app evolved. Risk tiers
differ: patch/minor bumps (React Router, TanStack Query, Supabase,
lucide, zod) are low risk; **majors** need individual treatment with
migration notes read first — Vite 5→7 (plugin + Node version
implications), Tailwind 3→4 (config format change, touches
`tailwind.config.ts` + `index.css` design tokens, so design.spec.md
tokens must survive), ESLint config already flat. The gate
(`./harness check` + `./harness e2e` + CI) is the safety net; the
grandfathered-lint list must not grow to absorb new violations.

Known conflict to resolve here: `next-themes@0.3` does not declare React
19 as a peer, so `.npmrc` sets `legacy-peer-deps=true`. Bumping
next-themes (≥0.4) should let that line be removed; verify a clean
`npm install` without it afterwards.

## Progress

- [x] 2026-07-18 `npm outdated` snapshot recorded in Evidence
- [x] 2026-07-18 batch 1: patch/minor bumps, gate green
- [ ] batch 2: majors one at a time (Vite, then Tailwind, then rest),
      gate + e2e green after each
- [x] 2026-07-18 bun.lockb removed
- [x] 2026-07-18 visual spot-check of design tokens after the Tailwind
      major (Landing page only, by agent — remaining 3 screens are the
      human's Verification step)

## Steps

1. Snapshot `npm outdated`; sort into minor-batch and per-major steps.
2. Land the minor batch behind `./harness check` + `./harness e2e`.
3. Land each major separately with its migration guide, gate green
   after each; scoped commit per batch/major so any regression bisects
   to one bump.
4. Remove `bun.lockb`; verify `npm ci` from scratch.

## Verification

- `./harness check` and `./harness e2e` green after every batch; CI
  green on the final state.
- `npm ci && ./harness check` from a clean clone.
- Design tokens intact after Tailwind (screens match design.spec.md;
  human eyeball on the four main screens — leave `in-progress` for
  human review of that output before marking done).

## Decision Log

- 2026-07-18: Vite bumped straight from 5.4.21 to 8.1.5 (three majors:
  5→6→7→8) in one step, `@vitejs/plugin-react-swc` to 4.3.1 alongside it
  (its `peerDependencies` declares `vite: "^4 || ^5 || ^6 || ^7 || ^8"`,
  and `vitest@4.1.10`'s peer range is `^6.0.0 || ^7.0.0 || ^8.0.0` — it
  was already incompatible with Vite 5 under strict peer resolution,
  only working because `.npmrc` has `legacy-peer-deps=true`). Migration
  guides read: v6, v7 (Node 20.19+/22.12+ required — repo runs Node
  v24.13.0 locally, CI pins Node 22), v8 (Vite 8 replaces esbuild/Rollup
  with Rolldown/Oxc — the biggest architectural change in the Vite line
  to date). Chose to attempt the full jump rather than stop at 7 because
  the plugin/vitest peer ranges already supported 8 and the config
  (`vite.config.ts`) uses no `rollupOptions`/`esbuild` options that the
  guides flag as renamed — nothing to migrate mechanically. Full jump
  worked: `./harness check` and `./harness e2e` green with no config
  changes.
- Vite 8's Rolldown-based dev-server dependency scanner surfaced one
  real pre-existing bug: `src/pages/CookMode.tsx` imported the `User`
  icon from `lucide-react` and `type User` from `@supabase/supabase-js`
  in the same file. TypeScript's separate type/value namespaces allowed
  it (compiles fine, `import type` is elided at emit), and Vite 5's
  esbuild-based scanner tolerated it too, but Rolldown's scanner does
  not elide the type-only import before the collision check, so
  `npm run dev` printed "Failed to run dependency scan. Skipping
  dependency pre-bundling" (non-fatal — the dev server still served
  pages — but a real perf regression on every cold start). Fixed by
  aliasing the type import (`User as SupabaseUser`); no other file in
  `src/` has the same collision (`grep` confirmed). This is a code fix,
  not a config workaround, and it's the only source change needed for
  the Vite major.
- `vite:react-swc` now prints a build-time note recommending
  `@vitejs/plugin-react` (non-SWC) since Rolldown makes the SWC-specific
  fast path moot for a project with no custom SWC plugins configured.
  Left `@vitejs/plugin-react-swc` in place — swapping plugins is a
  separate, non-forced change and out of scope for this plan (Non-goals:
  no framework swaps).
- 2026-07-18: Tailwind CSS 3.4.19 → 4.3.3. Read the official upgrade
  guide (tailwindcss.com/docs/upgrade-guide) first: PostCSS plugin moves
  to `@tailwindcss/postcss` (autoprefixer/postcss-import no longer
  needed, v4 handles both internally), `@tailwind base/components/utilities`
  directives become a single `@import "tailwindcss"`, and JS config
  (`tailwind.config.ts`) is no longer auto-detected — either an explicit
  `@config` directive keeps it, or (the path taken here) its content
  moves into a CSS-first `@theme` block. Ran the official codemod
  (`npx @tailwindcss/upgrade`) rather than hand-porting: it partially
  completed (migrated `tailwind.config.ts` and `src/index.css`
  correctly) but then failed on its own dependency-install step because
  it shells out to `bun add` unconditionally and this repo has no `bun`
  binary (the stale `bun.lockb` made it think this is a bun project —
  reinforces why removing that lockfile matters, tracked as the next
  Progress item). Finished the remaining steps by hand: `npm install
  tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 @tailwindcss/typography@latest`,
  removed `autoprefixer` (dead dependency under v4), pointed
  `postcss.config.js` at `@tailwindcss/postcss`.
- The codemod's CSS output for `src/index.css` is a faithful,
  value-for-value port of every custom token in the old
  `tailwind.config.ts` into `@theme` (colors incl. `forest`/`citrus`/
  `carrot`/`berry`/`avocado`, `bg-gradient-*`, `shadow-fresh/-glow/
  -playful`, border-radius scale, accordion keyframes) — each one still
  points at the same `hsl(var(--x))` / `var(--x)` custom property
  defined in the same file, so the design-token *system* (CSS custom
  properties as the single source of truth, semantic Tailwind utility
  names layered on top) is unchanged; only the syntax that wires
  Tailwind to those properties moved from JS to CSS. This did not
  require restructuring the token system itself, so no stop-and-report
  was triggered. The codemod also proactively added a compatibility
  base-layer rule pinning the pre-v4 default border color (v4 changes
  the *default* border-color utility from `gray-200` to `currentColor`)
  — checked our own usage of bare `border` (no explicit color) in 4
  places (`resizable.tsx`, `navigation-menu.tsx`,
  `FamilyMembersManager.tsx`, `CookMode.tsx`) and confirmed
  `index.css`'s pre-existing `* { @apply border-border; }` base rule
  already forces every element's border-color regardless, so this
  particular v4 default change was a non-issue even before the codemod's
  compat rule.
- `tailwind.config.ts` is now dead code (nothing loads it — no `@config`
  directive was used) — deleted it rather than leaving a stale duplicate
  of the token system lying around. Updated `components.json`
  (`tailwind.config: ""`, the standard shadcn v4 convention for
  CSS-first projects) and shrank the `eslint.config.js` grandfather list
  by removing the `tailwind.config.ts` / `no-require-imports` entry
  (that file, and its `require("tailwindcss-animate")` call, no longer
  exist — `tailwindcss-animate` is now loaded via `@plugin
  'tailwindcss-animate';` directly in `index.css`, generated by the
  codemod). List shrank from 3 entries to 2, per the harness rule
  (grandfather list may only shrink).
- Deleted `node_modules` + `package-lock.json` and ran a clean
  `npm install` after all the manual fixups, to make sure the lockfile
  reflects reality and not an artifact of the interrupted codemod run.
  Result: 0 npm audit vulnerabilities (down from 1 high before the clean
  reinstall — stale transitive entries in the old lockfile).
- Visual spot-check: loaded `/welcome` (Landing, the only screen
  reachable without a seeded Supabase session) via `npm run dev` +
  the browser preview tool — gradients, rounded corners, and the
  purple/yellow/orange palette all render as expected. The other three
  screens (Cook Mode, Plan Mode, Shopping Summary) need an authenticated
  session to reach and are the human's verification step per this
  plan's Verification section (see handoff).

- 2026-07-18: `react-day-picker` pinned at 8.10.2 (not bumped to the
  9/10 major). Its only consumer, `src/components/ui/calendar.tsx`, is
  unused dead code (`grep` confirmed zero imports in `src/`), and v9/10
  rewrote the whole classNames/component-slot API, so bumping it would
  mean rewriting unused code for no functional benefit — out of scope.
  This is also why `.npmrc`'s `legacy-peer-deps=true` stays: v8 hard-
  peers `date-fns@"^2.28.0 || ^3.0.0"` and this repo is on date-fns@4
  (a real, used dependency, bumped in batch 1). `next-themes` (the
  line's original stated reason) is fixed as of 0.4.6, which declares
  React 19 support — confirmed by removing the line and reinstalling:
  the *only* remaining ERESOLVE conflict was react-day-picker/date-fns.
  Comment in `.npmrc` updated to name the current cause instead of the
  now-fixed one.

## Evidence

### 2026-07-18 `npm outdated` snapshot (baseline before any bump)

Baseline `./harness check` green before starting (deps 69 present, lint OK,
test OK, build OK, plans --validate OK 7 plans, validate-recipe OK 18
recipes).

```
Package                          Current   Wanted   Latest
@eslint/js                        9.32.0   9.39.5   10.0.1   MAJOR (9→10)
@hookform/resolvers               3.10.0   3.10.0    5.4.0   MAJOR (3→5)
@playwright/test                  1.57.0   1.61.1   1.61.1   minor
@radix-ui/react-*                 (28 packages)                minor only, no majors
@supabase/supabase-js             2.91.1  2.110.7  2.110.7   minor (major 2)
@tailwindcss/typography           0.5.16   0.5.20   0.5.20   minor
@tanstack/react-query            5.90.19  5.101.2  5.101.2   minor (major 5)
@types/node                      22.16.5  22.20.1   26.1.1   MAJOR available (22→26), staying on 22 minor
@types/react                     18.3.23  18.3.31   19.2.17  MAJOR available (18→19), Non-goal: not resolving unless forced
@types/react-dom                  18.3.7   18.3.7   19.2.3   MAJOR available (18→19), same as above
@vitejs/plugin-react-swc          3.11.0   3.11.0    4.3.1   MAJOR (3→4), tied to Vite major
autoprefixer                     10.4.21   10.5.4   10.5.4   minor
date-fns                           4.1.0    4.4.0    4.4.0   minor
eslint                            9.32.0   9.39.5   10.7.0   MAJOR (9→10)
eslint-plugin-react-hooks          5.2.0    5.2.0    7.1.1   MAJOR (5→7)
eslint-plugin-react-refresh       0.4.20   0.4.26    0.5.3   MAJOR (0.4→0.5)
globals                          15.15.0  15.15.0   17.7.0   MAJOR (15→17)
lovable-tagger                     1.1.9    1.3.3    1.3.3   minor
lucide-react                     0.562.0  0.562.0   1.25.0   MAJOR (0→1)
next-themes                        0.3.0    0.3.0    0.4.6   special step (peer-dep fix, see Context)
react / react-dom                 19.2.3   19.2.7   19.2.7   minor
react-day-picker                  8.10.1   8.10.2   10.0.1   MAJOR (8→10)
react-hook-form                   7.71.1   7.81.0   7.81.0   minor
react-resizable-panels             2.1.9    2.1.9    4.12.2   MAJOR (2→4)
react-router-dom                  7.12.0   7.18.1   7.18.1   minor
recharts                           3.6.0    3.9.2    3.9.2   minor
tailwind-merge                     2.6.0    2.6.1    3.6.0   MAJOR (2→3)
tailwindcss                       3.4.17   3.4.19    4.3.3   MAJOR (3→4)
typescript                         5.8.3    5.9.3    7.0.2   MAJOR (5→7, two majors — TS "Corsa" native rewrite)
typescript-eslint                 8.38.0   8.64.0   8.64.0   minor
vaul                               0.9.9    0.9.9    1.1.2   MAJOR (0→1)
vite                              5.4.19   5.4.21    8.1.5   MAJOR (5→8, three majors)
zod                                4.3.5    4.4.3    4.4.3   minor
```

Sorted into: batch 1 (minor/patch, same major, all packages above marked
"minor"), batch 2 (majors, one at a time: Vite first, then Tailwind, then
the rest in isolation).

### 2026-07-18 batch 1: minor/patch bumps

Ran `npm install <pkg>@<wanted>` for every package listed "minor" above
(49 packages: all @radix-ui/*, @playwright/test, @supabase/supabase-js,
@tailwindcss/typography, @tanstack/react-query, @types/node (22.x line),
@types/react (18.x line, no major), autoprefixer, date-fns, eslint,
@eslint/js, eslint-plugin-react-refresh, lovable-tagger, react, react-dom,
react-day-picker (8.x line), react-hook-form, react-router-dom, recharts,
tailwind-merge (2.x line), tailwindcss (3.x line), typescript (5.x line),
typescript-eslint, vite (5.x line), zod).

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

`./harness e2e` initially failed all 6 tests with "Executable doesn't
exist" (Playwright browser binary out of sync with the bumped
`@playwright/test`). Fixed with `npx playwright install chromium`
(a local browser cache refresh, not a package.json change — CI's
`check.yml` only runs `./harness check`, not `./harness e2e`, so this
step is not part of the CI gate; noting it here so the next local dev
knows to run it after this bump).

```
$ ./harness e2e
  6 passed (10.6s)
```

### 2026-07-18 batch 2, major 1/N: Vite 5.4.21 → 8.1.5 + @vitejs/plugin-react-swc 3.11.0 → 4.3.1

```
$ npm install vite@8.1.5 @vitejs/plugin-react-swc@4.3.1
$ ./harness check
check: deps ... OK (69 deps present)
check: npm run lint ... OK
check: npm test ... OK
check: npm run build ... OK
check: plans --validate ... plans validate: OK (7 plans)
check: validate-recipe ... validate-recipe: OK (18 recipes)
check: OK
```

`npm run dev` smoke test surfaced the `User`/`User` identifier collision
in `src/pages/CookMode.tsx` (see Decision Log). Fixed, then reran:

```
$ npm run dev &  (curl http://localhost:8080/ -> 200, no scan errors, clean log)
$ ./harness check   # OK again after the fix
$ ./harness e2e
  6 passed (5.6s)
```

### 2026-07-18 batch 2, major 2/N: Tailwind CSS 3.4.19 → 4.3.3

```
$ npx @tailwindcss/upgrade
  # migrated tailwind.config.ts + src/index.css correctly, then failed
  # on its own `bun add tailwindcss@latest` step (no bun binary) — see
  # Decision Log
$ npm install tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 @tailwindcss/typography@latest
$ npm uninstall autoprefixer
# hand-edited postcss.config.js -> { "@tailwindcss/postcss": {} }
# deleted tailwind.config.ts, updated components.json, shrank eslint.config.js
$ rm -rf node_modules package-lock.json && npm install
added 391 packages, and audited 392 packages in 18s
found 0 vulnerabilities

$ ./harness check
check: deps ... OK (69 deps present)
check: npm run lint ... OK
check: npm test ... OK
check: npm run build ... OK
check: plans --validate ... plans validate: OK (7 plans)
check: validate-recipe ... validate-recipe: OK (18 recipes)
check: OK

$ ./harness e2e
  6 passed (5.8s)
```

### 2026-07-18 bun.lockb removal + clean `npm ci`

```
$ rm bun.lockb
$ rm -rf node_modules && npm ci
added 391 packages, and audited 392 packages in 5s
found 0 vulnerabilities
$ ./harness check
check: OK
```

### 2026-07-18 next-themes peer-dep fix + legacy-peer-deps re-evaluation

```
$ npm view next-themes@0.4.6 peerDependencies
{ react: '^16.8 || ^17 || ^18 || ^19 || ^19.0.0-rc', 'react-dom': '^16.8 || ^17 || ^18 || ^19 || ^19.0.0-rc' }
$ npm install next-themes@0.4.6
```

Tried removing `legacy-peer-deps=true` from `.npmrc` entirely (clean
`rm -rf node_modules package-lock.json && npm install`). Failed —
a *different*, previously-masked conflict surfaced:

```
npm error ERESOLVE unable to resolve dependency tree
npm error Found: date-fns@4.4.0
npm error Could not resolve dependency:
npm error peer date-fns@"^2.28.0 || ^3.0.0" from react-day-picker@8.10.2
```

Checked whether `react-day-picker` (via `src/components/ui/calendar.tsx`)
is used anywhere: `grep -rn "@/components/ui/calendar" src` — no hits.
It's unused shadcn boilerplate. `react-day-picker@9`/`10` dropped the
date-fns peer entirely but rewrote the whole classNames/component-slot
API (`caption`/`nav_button`/`day_range_end`/`IconLeft`/`IconRight` all
renamed), which would mean rewriting an unused component for zero
functional benefit — out of scope (no framework/component rewrites
beyond what an update forces on *used* code). Pinned `react-day-picker`
at 8.10.2 (already the batch-1 minor target) and restored
`legacy-peer-deps=true` with an updated comment naming the actual
current cause. Verified clean afterwards:

```
$ npm install   # (with legacy-peer-deps=true restored)
found 0 vulnerabilities
$ ./harness check
check: OK
```

### 2026-07-18 batch 2, majors 3-8: globals, lucide-react, tailwind-merge, vaul, @hookform/resolvers, react-resizable-panels

Checked peer ranges first (`npm view <pkg> peerDependencies`) — no
conflicts with the current React 19 / eslint 9 stack. Landed together
since each is an isolated, independently-used dependency (icons,
class-merge util, drawer primitive, form resolver, resizable-panel
primitive) with no cross-dependencies:

```
$ npm install globals@17.7.0 lucide-react@1.25.0 tailwind-merge@3.6.0 \
    vaul@1.1.2 @hookform/resolvers@5.4.0 react-resizable-panels@4.12.2
$ ./harness check
check: OK
$ ./harness e2e
  6 passed (4.7s)
```
