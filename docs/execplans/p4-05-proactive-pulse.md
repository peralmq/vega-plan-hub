---
id: p4-05-proactive-pulse
title: Proactive pulse — runs-low nudge, tonight ping, one-tap ratings
phase: P4
status: todo
depends_on: [p4-03-planning-conversation]
---

## Goal

The rationed proactive layer (Script 8 + the Script 5 trigger): a
runs-low nudge ("planned through tomorrow — plan the next few days?")
with horizon buttons that opens the p4-03 conversation; an afternoon
tonight-ping with the summary card; a post-dinner one-tap emoji rating
(`recipe_ratings` per partner) plus free-text recipe notes
(`recipe_comments`) that resurface in cook mode. Every ping type is
individually mutable in chat ("sluta påminna om X").

## Non-goals

- No scheduling infrastructure beyond one mechanism (pg_cron +
  edge-function invoke, or the Track B runtime's scheduler — match
  the transport p4-02 recorded; do not build both).
- No smart send-time learning; fixed times, config in one place.
- No new rating model — the existing `recipe_ratings` /
  `recipe_comments` tables as-is.

## Context

Proactivity budget verdicts (A.6) and rating-UX verdict from the R1
dry-run govern which pings ship enabled — read the filled verdict
table first; the budget's default posture is "fewer than feels
clever" (two-user household, every ping hits half the userbase).
Runs-low threshold + default horizon come from the A.3 verdicts.
Tonight card reuses the p4-02/p4-03 card rendering; ratings write the
same tables the web uses (`useRecipeRatings`, `useRecipeComments`
show them — verify no shape drift).

## Progress

- [ ] Scheduler mechanism (transport-matched) + config
- [ ] Runs-low nudge → p4-03 flow
- [ ] Tonight ping; post-dinner rating prompt with dual-partner tally
- [ ] Per-ping mute; notes resurface in cook mode
- [ ] One week live; muted-ping audit recorded

## Steps

1. Scheduler per transport; all send-times + thresholds in one config
   with a documented mute state per ping type.
2. Runs-low check (last planned `meal_date` − today ≤ verdict
   threshold) firing at the verdict time; dedupe so it never fires
   twice for the same gap.
3. Tonight ping at the verdict hour, only when a meal is planned.
4. Rating prompt only on cooked evenings (a meal was planned today),
   ✏️-edited tally as both partners tap; `note_recipe` free text →
   `recipe_comments`, surfaced in the web cook mode for that recipe.
5. Mute commands; log every proactive send for the week-one audit.

## Verification

- `./harness check` passes; nudge threshold, dedupe, and
  cooked-evening gating unit-tested with a frozen clock.
- Fixture replay: rating tally edit-in-place against the mocked Bot
  API.
- Live, after one week: the send log matches the configured budget;
  the A.6 audit ("which pings survived") is recorded in this plan's
  Evidence.

## Evidence

(recorded during implementation)
