---
id: p1-01-spec-extraction
title: Extract the shipped app into durable specs (product / tech / design)
phase: P1
status: done
depends_on: [p0-00-harness-bootstrap]
---

## Goal

Durable, sliced specs describing the app *as shipped*, so future work is
spec-first: `docs/specs/product.spec.md` (problem, users, success),
`tech.spec.md` (stack, structure, data model, boundaries),
`design.spec.md` (UX flows, screens, visual identity). Format informed
by addyosmani.com/blog/good-spec/ and the spec-driven-development skill
(commands early, real structure, three-tier boundaries, living
document). This is the first ratchet-enabled execplan after bootstrap.

## Non-goals

- No behavior changes; extraction only.
- No Supabase schema documentation beyond what the client code proves.
- No rewrite of conventions.spec.md (only corrections where the app
  contradicts it).

## Context

The repo predates its specs. A 2026-07-17 rebase revealed the app had
evolved well past the old AGENTS.md description: Supabase auth +
Postgres persistence (meal_plans, daily_meals, family_members,
recipe_ratings, recipe_comments), five auth-gated routes with Cook Mode
as home, 19 markdown recipes with table-format ingredients, pure
scaling/normalization logic in `src/lib/`, and a mock Mathem price
service. The old "client-side localStorage app" claim was stale.

## Progress

- [x] 2026-07-17 surveyed shipped app (routes, hooks, services, data model)
- [x] 2026-07-17 product.spec.md, tech.spec.md, design.spec.md written
- [x] 2026-07-17 stale claims fixed in conventions.spec.md and AGENTS.md
- [x] 2026-07-17 recipe-format README drift recorded in tech.spec.md

## Steps

1. Survey `src/` (App routes, pages, hooks, services, lib, data,
   supabase integration) and record ground truth.
2. Write the three spec slices; cross-reference instead of duplicating.
3. Correct contradictions in existing specs/AGENTS.md.
4. Record discovered drift as work items (recipe README vs. table
   format → owned by the `validate-recipe` plan).

## Verification

- `./harness check` green.
- Each spec names the commit it was extracted from (`fe922eb`).
- No spec claims contradicted by code: routes match `App.tsx`, tables
  match `supabase.from()` call sites, recipe format matches
  `recipeLoader.ts` and the actual files.

## Surprises & Discoveries

- The app has real auth + a database — the old AGENTS.md said the
  opposite. Extraction-before-planning proved its worth immediately.
- `src/data/recipes/README.md` documents a retired list-based
  ingredient format; loader + all 19 recipes use markdown tables.
- `mathemPriceService` is a mock with hardcoded prices, despite reading
  like an integration.

## Evidence

Survey commands: `ls src/... `, `grep -rho "\.from('[a-z_]*')" src`
(→ daily_meals, family_members, meal_plans, recipe_comments,
recipe_ratings), reads of `App.tsx`, `recipeLoader.ts`,
`useMealPlanDB.ts`, `mathemPriceService.ts`, `chana-dal.md`,
`src/data/recipes/README.md`. Gate run recorded in the bootstrap
session handoff (see commit for this plan).
