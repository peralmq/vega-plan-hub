---
id: p4-12-web-pool-plan
title: The web app on the batch pool — locked menus show up, days pick from the list
phase: P4
status: in-progress
depends_on: [p4-01-schema-rolling-plan, p3-01-kreuzberg-redesign]
---

## Goal

A batch locked in Telegram is *visible and usable* on
peralmq.github.io/vega-plan-hub, in the pool UX (design.spec "Pool
over calendar", directive Pelle 2026-08-27): Plan Mode shows the
active batch as a list of meals with counts (🍱 ×2 badge) instead of
weekday slots; Cook Mode's "tonight" is a pick from the remaining
pool (cooked entries shown as done); Shopping Summary aggregates the
batch's pool. This closes the gap that the web app still reads the
legacy `meal_plans`/`daily_meals` weekly tables while the bot writes
`plan_batches`/`planned_meals` — a bot-locked menu currently never
appears on the site.

## Non-goals

- No calendar/day-grid UI survives: the weekday-slot Plan Mode is
  retired, not kept alongside.
- No web-side batch *locking* flow in this plan — the web can edit
  the pool of the active batch, but the draft→lock ritual stays in
  chat (p4-03). Overlap rules follow p4-03's.
- No removal of the legacy tables' data; reading them stops, dropping
  them is a later, separate decision.

## Context

Today `CookMode`/`PlanMode`/`ShoppingSummary` are built on
`meal_plans` + `daily_meals` (`week_start`, `day_of_week` 0–6).
Target model: `plan_batches` (covered range) + `planned_meals` as
pool entries — a meal prep is the same `recipe_id` twice. **Schema
gate (ask-first per AGENTS.md):** the pool model needs the minimal §1
delta recorded in tech.spec ("Pool model": `meal_date` nullable +
`cooked_on` stamp when a dish is picked, or equivalent) — confirm the
exact migration with Pelle at dispatch before writing it. Aggregation
in `src/lib/` already normalizes + scales; it must consume pool
entries without forking. The p4-11 deep-link contract (`?recipe=` +
`&x=`) applies to whichever dish the pool pick opens.

## Progress

- [x] 2026-08-27 Schema delta confirmed at dispatch and migrated
      (nullable `meal_date` + `cooked_on`); migration file written,
      generated types hand-extended — **not yet applied to the live
      Supabase project** (no CLI auth from this environment; stays
      with the human, see Evidence)
- [x] 2026-08-27 Data layer reads `plan_batches`/`planned_meals` via
      `useBatchPool`; legacy weekly reads removed (`useMealPlanDB`,
      `planDates.ts` deleted)
- [x] 2026-08-27 Plan Mode: pool list UI (dish × count, 🍱 badge,
      multiplier per entry, add/remove from library)
- [x] 2026-08-27 Cook Mode: pick-tonight from remaining pool; picking
      stamps `cooked_on`; done entries visible; same-day undo
- [x] 2026-08-27 Shopping Summary aggregates the active batch
- [ ] Live: a bot-locked batch appears on the site; a dish picked and
      cooked from the pool — **human verification, not done here**

## Steps

1. Confirm + apply the schema delta (gate). Regenerate Supabase types.
2. Data hooks for active batch + pool entries (stateless
   re-derivation, current-and-next-batch fetch mirroring the old
   two-week window).
3. Plan Mode rebuild on the pool list; keep the recipe picker and
   per-entry multiplier; playful empty state for "no active batch —
   plan one in chat 💬".
4. Cook Mode: remaining-pool picker as the tonight surface; pick →
   `cooked_on` stamp; un-pick allowed same-day (mistake recovery);
   deep links (p4-11) still open a specific dish directly.
5. Shopping Summary over the batch pool via the shared aggregation
   lib; checked state remains per `shopping_list_items` row.
6. Update e2e flows (p1-03 suite) from weekday planning to pool
   planning; migrate fixtures.

## Decision Log

- 2026-08-27, Pelle in chat at dispatch: schema gate CLEARED — the
  minimal delta is `planned_meals.meal_date` relaxed to nullable + a
  new `cooked_on` timestamp (date) stamped when a dish is picked in
  Cook Mode. Written as `supabase/migrations/20260827120000_p4_12_pool_model.sql`,
  following `20260731200000_p4_01_rolling_plan_schema.sql`'s style.
  The old `unique_user_meal_date` constraint is dropped in the same
  migration: it modeled "one row per calendar day," which stops being
  true once pool rows carry no date at all — nothing in the new
  read/write path relies on it, so it's dropped rather than kept
  vestigial. `idx_planned_meals_user_date` (on the now-nullable
  `meal_date`) is left in place — harmless, and still serves any
  historical date-keyed rows.
- Not applied to the live Supabase project from this environment (no
  Supabase CLI auth here, as flagged at dispatch) — the migration file
  and the hand-extended `src/integrations/supabase/types.ts` are the
  deliverable; live application + `supabase gen types` regeneration
  against the real project is a human follow-up.
- "Active batch" = the `plan_batches` row whose `[starts_on, ends_on]`
  covers today; "next batch" = the soonest batch starting after today.
  This mirrors the retired current/next-*week* window as a
  current/next-*batch* window (`findCurrentBatch`/`findNextBatch`,
  `src/lib/planPool.ts`). Overlap resolution stays p4-03's problem
  (non-goal here).
- Plan Mode's edit target is the *active* batch only. The hook also
  fetches `nextBatch` (satisfies the "current-and-next" data-layer
  requirement in Steps) but no page renders it yet — editing or
  previewing an upcoming batch isn't asked for by this plan's Goal
  ("Plan Mode shows *the active batch*") and would be scope growth
  toward p4-03/p4-05 territory.
- Cook Mode's "pick" *is* the commit: choosing a dish from the
  remaining-pool picker immediately stamps `cooked_on` (no separate
  confirm step) — matches the design.spec wording ("choose-from-
  remaining picker") and keeps the interaction one tap. Undo
  (`uncookPoolEntry`) is offered whenever the selected entry's
  `cooked_on` is today, regardless of how it got selected.
- Shopping Summary aggregates the *whole* active batch's pool
  (cooked + remaining), not just what's left to cook — matches the
  retired behavior (the old page aggregated the whole week
  regardless of which days were past) and the product framing
  ("shop for the batch").
- The old day-grid's Auto-Fill and day-swap actions have no pool
  analogue and are dropped, not ported — pool entries aren't
  positional, so "swap two days" and "fill remaining days" don't mean
  anything. Only add/remove/multiplier survive, matching the plan's
  Steps wording.

## Residual risk (flagged, not fixed — out of this plan's scope)

`bot/tools.ts`'s `resolveNoteRecipe` (the p4-08 `note_recipe` target
resolution) falls back to `planned_meals` filtered by
`meal_date = today` when no dish is named in the message. New pool
writes never set `meal_date`, so that fallback will now always find
zero rows — it degrades gracefully (returns `null`, the existing
"couldn't tell which recipe" path), not a crash, but the "note on
tonight's dish" shortcut is effectively dead until the bot is updated
to resolve "tonight" from `cooked_on = today` instead. Bot code is
outside this plan's stated scope (schema + data layer + web pages +
e2e) — flagging for a follow-up rather than editing `bot/` here.

## Verification

- `./harness check` passes; unit tests cover pool aggregation with a
  duplicate-recipe (🍱) pool, cooked/remaining partition, and the
  empty-batch state; e2e covers plan-pick-cook-shop on mock auth.
- Live: household locks a batch in chat, opens the site, sees the
  menu pool, picks and cooks one dish, list stays consistent.

## Evidence

`src/lib/planPool.test.ts` written first (red — module didn't exist):

```
$ npx vitest run src/lib/planPool.test.ts
 FAIL  src/lib/planPool.test.ts [ src/lib/planPool.test.ts ]
Error: Cannot find module './planPool' imported from src/lib/planPool.test.ts
```

Then `src/lib/planPool.ts` written (green):

```
$ npx vitest run src/lib/planPool.test.ts
 Test Files  1 passed (1)
      Tests  13 passed (13)
```

Full harness gate, after all pages/hooks/mocks were rewired:

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

`npm test` inside `check` covers the full unit suite (270 tests, all
`src/**/*.test.ts` including the new `planPool.test.ts`), no
regressions in the untouched suites (`cookModeDeepLink.test.ts`,
`ingredientNormalization.test.ts`, `ingredientScaling.test.ts`, etc.).

E2e suite (migrated to pool fixtures — `plan-week.spec.ts` replaced by
`plan-pool.spec.ts`; `cook-mode.spec.ts`, `shopping-summary.spec.ts`,
`cook-mode-deep-link.spec.ts`, `smoke.spec.ts` updated in place;
`e2e/support/mockDb.ts` now emulates `plan_batches` +
pool-shaped `planned_meals`, including PATCH for `.update()`):

```
$ npx playwright install chromium   # already present, no-op
$ ./harness e2e
Running 20 tests using 5 workers
  20 passed (5.5s)
```

(One first pass had a strict-mode-violation flake in
`cook-mode-deep-link.spec.ts` — a `getByText` regex matched both the
toast body and the screen-reader status echo. Fixed with `.first()`;
rerun above is the fixed, green run.)

Manual sanity check in mock-auth dev mode (`./harness dev-mock`,
driven via the Claude Browser tool against `http://localhost:8080`):
Cook Mode's picker showed the 5-dish pool with the 🍱 ×2 meal-prep
badge and the batch-overview strip ("Batch 2026-08-26 → 2026-08-30 ·
1/5 cooked"); picking a dish updated the count to 2/5, showed the
recipe detail scaled to its pool multiplier (8 servings = 4-serving
recipe × the seeded 2× entry), and offered "Not tonight after all —
undo"; Plan Mode showed the same pool with per-entry multipliers and
the already-cooked entry dimmed with a "Cooked <date>" badge; Shopping
Summary aggregated the whole pool with the same 🍱 ×2 badge in the
sidebar. No console errors observed.

Migration: **not applied to a live Supabase project** — no Supabase
CLI auth available in this environment (expected per the dispatch
brief). `supabase/migrations/20260827120000_p4_12_pool_model.sql` is
the deliverable; `src/integrations/supabase/types.ts` was hand-
extended (not machine-generated) to match. Live application and
`supabase gen types` regeneration are the human's follow-up, alongside
the Live Progress/Verification bullets.

- 2026-08-27, post-apply: Lovable ran the migration and recorded it as
  `supabase/migrations/20260827064928_79127d6f-c46e-49c9-924c-64c9cdd466de.sql`
  (byte-identical DDL, its own timestamp). Our original
  `20260827120000_p4_12_pool_model.sql` sorted *after* it and would
  re-run on any fresh migration pass (crashing on the duplicate
  `cooked_on` column), so the duplicate was removed — the Lovable file
  is the canonical applied record.
