---
id: p4-05-proactive-pulse
title: Proactive pulse — runs-low nudge, tonight ping, one-tap ratings
phase: P4
status: in-progress
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

- [x] Scheduler mechanism (transport-matched) + config
- [x] Runs-low nudge → p4-03 flow
- [x] Tonight ping; post-dinner rating prompt with dual-partner tally
- [x] Per-ping mute; notes resurface in cook mode
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

## Decision Log

- **Which pings ship enabled** — read the verdict tables first, as the
  Context demands: A.3 is filled (`docs/research/r1-conversation-scripts.md`,
  2026-08-27) with **default horizon 5 days**, but explicitly defers the
  runs-low trigger *to this plan*; **A.6 is still an empty row** (`☐`), as
  is the rating-UX half of A.6/Script 8. The gate-brief's standing rule for
  that case governs (`docs/research/gate-brief.md`: "p4-02..05 read the
  filled verdict table at dispatch and **fall back to the scripts' defaults
  where a row is empty**"), so the Script 5/8 defaults ship, all three on:
  tonight 16:00, runs-low 17:00, post-dinner rating 21:00 (Script 8's "max a
  few times/week" is what the cooked-evening gate produces on its own). The
  budget's "fewer than feels clever" posture is carried by the per-ping mute
  and the `/pulse` audit — week one decides which survive, and A.6 then gets
  filled from the send log rather than from a guess made at build time.
- **Runs-low threshold, in the pool model** — the plan's wording ("last
  planned `meal_date` − today ≤ threshold") predates the pool directive;
  `planned_meals` rows carry no dates any more (design.spec "Pool over
  calendar"). The honest translation of Script 5's "planned through
  tomorrow" is **≤ 1 uncooked dish left in the active batch**
  (`PULSE_CONFIG.runsLowRemaining = 1`), with the active batch chosen by the
  open-ended rule (`findCurrentBatch`, never by `ends_on`).
- **One scheduler, not two** — the transport p4-02 recorded is hybrid via
  queue with the Track B runtime on household hardware (tech.spec "Chat
  assistant"), so the scheduler is a 60s tick inside `bot/consumer.ts`. No
  pg_cron, no edge-function invoke: nothing exists that could double-send.
- **Night safety** (directive Pelle 2026-08-30) — armed with `setInterval`
  only, never an immediate call, and a slot is due only inside its own
  45-minute window after a fixed afternoon/evening send time. A restart at
  any hour therefore sends nothing, and a laptop waking at 23:00 with a
  missed 16:00 slot behind it does not catch up. Proven by unit test and by
  the live boot log below.
- **No schema** (plan non-goals + directive 3) — mute flags and the send log
  live in a gitignored mode-600 `bot/.pulse-state.json`, the same pattern as
  `compare/.rotation.json`. Ratings write the existing `recipe_ratings`
  rows as-is (🤩 5 · 😋 4 · 😐 3 · 👎 1 on the existing 1–5 column, one row
  per family member, updated in place) — the same rows `useRecipeRatings`
  reads, verified against its shape.
- **"Notes resurface in cook mode"** — the plan's Step 4 wording ("`note_recipe`
  free text → `recipe_comments`") predates p4-08's adopted repo-write path
  (tech.spec, 2026-08-24), which now owns note capture. Building a second
  capture flow would be drift, so the *existing* confirm-and-publish path
  additionally **mirrors** the committed note line into `recipe_comments`.
  That is what makes it visible: `CookMode.tsx` renders `<RecipeComments>`,
  while the markdown `## Notes` section p4-08 writes is parsed by the loader
  and displayed nowhere. One confirmation, one capture path, two
  destinations; best-effort, so a mirror failure can never report a
  successful commit as failed.

## Evidence

### Gate (2026-08-31, this change set)

```
$ ./harness check
check: deps ... OK (73 deps present)
check: npm run lint ... OK (8/8 warnings)
check: npm test ... OK
check: npm run build ... OK
check: tsc bot ... OK
check: tsc compare ... OK
check: plans --validate ... plans validate: OK (35 plans)
check: validate-recipe ... validate-recipe: OK (30 recipes)
check: OK

$ npm test --silent
 Test Files  28 passed (28)
      Tests  513 passed (513)

$ npx vitest run src/lib/proactivePulse.test.ts bot/pulse.test.ts bot/tools.test.ts
 Test Files  3 passed (3)
      Tests  63 passed (63)
```

New suites: `src/lib/proactivePulse.test.ts` (21 cases — frozen clock:
night safety, grace windows, dedupe keys, runs-low threshold, copy, the
rating callback vocabulary, mute parsing, `/pulse` rendering) and
`bot/pulse.test.ts` (13 cases — the Supabase/Telegram seam: night ticks,
the three pings' gating and dedupe, the **rating tally edited in place
against the mocked Bot API**, per-ping mute, the send log). Two cases were
added to `bot/tools.test.ts` for the `recipe_comments` mirror. No fixture
files, no new harness commands, no migrations.

Night safety, as a unit test (`src/lib/proactivePulse.test.ts`):

```
✓ arms at 00:30 with every next fire later the same day — never now
✓ has nothing due anywhere in the night          (00–07, 22–23: all false)
✓ never catches up: a wake-up hours after a missed slot is not due
✓ rolls to tomorrow only once the slot has passed
```

and at the seam (`bot/pulse.test.ts`), against a pool seeded so that *every*
ping would otherwise fire:

```
✓ sends nothing on a tick at any hour of the night, however overdue
✓ reports only future fire times when it arms just after midnight
```

### Live deploy (recorded below at deploy time)

### Week one (pending)

The A.6 audit — which pings survived, from `[pulse] sent …` lines and
`/pulse` — is recorded here after one household week; `status` stays
`in-progress` until then.
