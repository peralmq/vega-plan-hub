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
- [ ] bun.lockb removed
- [ ] visual spot-check of design tokens after the Tailwind major

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
