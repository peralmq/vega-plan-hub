---
id: p4-01-schema-rolling-plan
title: Rolling-plan schema + web re-pointing (dates, batches, list, preferences)
phase: P4
status: done
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

- [x] Migration SQL written (tables + RLS + backfill) —
      `supabase/migrations/20260731200000_p4_01_rolling_plan_schema.sql`
- [x] DB types extended in `src/integrations/supabase/types.ts` (five new
      tables, hand-extended in generator style; regenerate from the live DB
      after the migration is applied)
- [x] `useMealPlanDB` re-pointed; date logic in `src/lib/planDates.ts`,
      preference read path in `src/lib/productPreferences.ts` +
      `src/hooks/useProductPreferences.ts` (both unit-tested)
- [x] Pages green (interface preserved — only ShoppingSummary gained the
      preference resolution); e2e `mockDb.ts` + mock-auth `mockStore.ts`
      re-pointed to `planned_meals`; both suites pass

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

Unit suite after adding `planDates.test.ts` (13 tests: mondayOf incl.
Sunday + year boundary, backfill arithmetic incl. month/year crossing,
window mapping, rowsToWeekMeals filtering/sorting/null-multiplier,
todayIndex Mon/Sun) and `productPreferences.test.ts` (4 tests:
current-map supersede + latest-valid_from, apply/no-op):

```
$ ./harness test
 Test Files  5 passed (5)
      Tests  84 passed (84)
```

Full gate:

```
$ ./harness check
check: deps ... OK (70 deps present)
check: npm run lint ... OK
check: npm test ... OK
check: npm run build ... OK
check: plans --validate ... plans validate: OK (16 plans)
check: validate-recipe ... validate-recipe: OK (30 recipes)
check: OK
```

Hermetic e2e over the re-pointed mock (plan-week exercises the new
delete-window + upsert-on-(user_id,meal_date) save path; cook-mode and
shopping-summary render from date-keyed seeds):

```
$ ./harness e2e
  6 passed (5.9s)
```

Notes: (1) The migration file is written but NOT applied to the hosted
Supabase project — applying it (`supabase db push` or dashboard SQL)
is the human's step; the app reads `planned_meals` from the moment it
deploys, so apply the migration first. (2) Old tables are retained per
the plan's non-goal; a later cleanup migration drops them after soak.
