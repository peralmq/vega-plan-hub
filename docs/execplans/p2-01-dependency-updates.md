---
id: p2-01-dependency-updates
title: Update lagging dependencies behind the matured gate
phase: P2
status: todo
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

- [ ] `npm outdated` snapshot recorded in Evidence
- [ ] batch 1: patch/minor bumps, gate green
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

## Evidence

(appended during implementation)
