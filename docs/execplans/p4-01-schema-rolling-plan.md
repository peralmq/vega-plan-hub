---
id: p4-01-schema-rolling-plan
title: Rolling-plan schema + web re-pointing (dates, batches, list, preferences)
phase: P4
status: todo
depends_on: []
---

## Goal

Land the approved P4 schema (tech.spec.md "Chat assistant";
docs/research/r4-data-model-security.md §1): `telegram_accounts`,
`planned_meals`, `plan_batches`, `shopping_list_items`,
`product_preferences`, with RLS matching the existing per-user pattern.
Re-point the web app from `meal_plans`/`daily_meals` to date-keyed
`planned_meals` (Plan Mode renders a week window over dates; Cook Mode
reads `meal_date = today`), with a data migration for existing rows.

## Non-goals

- No bot, no Telegram code, no LLM — schema + web only.
- No UI redesign of Plan Mode beyond what date-keying forces.
- No preference *learning* flows; the table ships empty (seeded by
  hand later) but Shopping Summary already resolves display names
  through it when rows exist.
- No dropping the old tables yet — that is a later cleanup migration
  once the new path has soaked.

## Context

Schema DDL and design rationale: docs/research/r4-data-model-security.md
§1–2 (approved at the 2026-07-31 gate; adopted calls: add-time
preference resolution, batchless ad-hoc items, per-person column
written null). Current client code: `src/hooks/useMealPlanDB.ts`
(week-keyed fetch), pages `PlanMode`, `CookMode`, `ShoppingSummary`;
e2e network mock in `e2e/support/mockDb.ts` mirrors the DB shape and
must move in lockstep. Migrations live in `supabase/migrations/`
(files only — applying to the hosted project is the human's step, note
it in the handoff).

## Progress

- [ ] Migration SQL written (tables + RLS + backfill)
- [ ] DB types regenerated/extended in `src/integrations/supabase/`
- [ ] `useMealPlanDB` re-pointed with unit-tested date logic in `src/lib/`
- [ ] Pages green; e2e mock updated; suites pass

## Steps

1. Write the migration file: five tables per r4 §1 DDL, RLS policies
   (`user_id = auth.uid()`), backfill insert
   (`week_start + day_of_week → meal_date`).
2. Extend the generated DB types; keep the markdown-recipe client-side
   join unchanged (`recipe_id` stays a text id).
3. Pure date-window logic (given today → week window rows, tonight
   lookup) goes in `src/lib/` with unit tests first.
4. Re-point `useMealPlanDB` (fetch by date range, upsert by
   `(user_id, meal_date)`); adjust Plan Mode / Cook Mode /
   Shopping Summary call sites; Shopping Summary resolves
   `display_name` through current `product_preferences` when present.
5. Update `e2e/support/mockDb.ts` + affected e2e specs to the new
   tables; run the full suites.

## Verification

- `./harness check` passes.
- `./harness e2e` passes with the re-pointed mock (plan-week,
  cook-mode, shopping-summary specs).
- Unit tests cover: week-window derivation across month/year
  boundaries, tonight lookup, backfill date arithmetic
  (Monday-start + day 0–6 → correct dates).

## Evidence

(recorded during implementation)
