---
id: p4-12-web-pool-plan
title: The web app on the batch pool — locked menus show up, days pick from the list
phase: P4
status: todo
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

- [ ] Schema delta confirmed at dispatch and migrated (nullable
      `meal_date`/`cooked_on` or equivalent)
- [ ] Data layer reads `plan_batches`/`planned_meals`; legacy weekly
      reads removed
- [ ] Plan Mode: pool list UI (dish × count, 🍱 badge, multiplier per
      entry, add/remove from library)
- [ ] Cook Mode: pick-tonight from remaining pool; picking stamps
      `cooked_on`; done entries visible
- [ ] Shopping Summary aggregates the active batch
- [ ] Live: a bot-locked batch appears on the site; a dish picked and
      cooked from the pool

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

## Verification

- `./harness check` passes; unit tests cover pool aggregation with a
  duplicate-recipe (🍱) pool, cooked/remaining partition, and the
  empty-batch state; e2e covers plan-pick-cook-shop on mock auth.
- Live: household locks a batch in chat, opens the site, sees the
  menu pool, picks and cooks one dish, list stays consistent.

## Evidence

(recorded during implementation)
