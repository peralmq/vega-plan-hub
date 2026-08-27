---
id: p4-03-planning-conversation
title: The rolling planning conversation — draft, edit, lock a batch
phase: P4
status: done
depends_on: [p4-02-capture-bot]
---

## Goal

Script 5 in production: "kan vi planera de närmsta dagarna?" (or a
horizon button) → draft proposal from the recipe library (ratings +
recency) → tap/text edits (swap a day, set multiplier) → **lock**
creates a `plan_batches` row, generates that batch's recipe-derived
`shopping_list_items` (normalized, scaled, preference-resolved), and
announces the list with SEK estimate. Mid-batch swaps (Script 6)
regenerate rows preserving checked-off state and offer the diff.

## Non-goals

- No proactive runs-low nudge (p4-05).
- No draft-quality ML: the proposer is a simple heuristic (unrated or
  stale-favorite mixing) — good enough to edit against.
- No multi-batch overlap handling beyond rejecting a lock that
  overlaps locked dates.

## Context

UX contract: r1-conversation-scripts.md Scripts 5–6 (edit-in-place,
mixed tap/text, lock as celebrated moment, batch diff) + the A.3
dry-run verdicts (runs-low threshold, default horizon, one-partner
lock — read them from the filled verdict table before building).
Schema: `planned_meals.batch_id`, `plan_batches` (p4-01). Aggregation
logic already exists in `src/lib/` (normalization + scaling) — the
bot path must reuse it, not fork it; recipe access per tech.spec.md
"Chat assistant" (shared loader or build-time mirror — pick in step 1
and record why).

2026-08-27 directive (Pelle): the first production batch is **5 days
including one meal prep**, and a batch is a **pool, not a calendar**
(design.spec "Pool over calendar"): the draft is a *list of meals
with counts* — no day assignment — and edits swap/add/remove list
entries, not weekdays. Which dish gets cooked which night is decided
later in Cook Mode (p4-12) or the daily nudge (p4-05), never at
planning time; r1 Script 5's per-day draft lines are superseded on
this point. Meal prep needs no extra concept: it is the same
`recipe_id` twice in the pool (two `planned_meals` rows, each with
its own multiplier) — the shared aggregation scales the shopping
list correctly. The proposer must be able to propose one meal-prep
pair for horizons ≥ 4 days (suitability = a simple heuristic over
tags — stews/dals/soups first; freely editable in the loop), and
draft + lock announcements badge it 🍱 ×2. Lock stores the pool plus
the covered date range on `plan_batches`. Downstream extensions of
the lock announcement: p4-10 (Swedish menu card) and p5-05 (batch →
compare handoff).

Recipe access (step 1, decided 2026-08-27): **shared loader** — see
Decision Log 1.

Inherited fix (p4-12 residual, 2026-08-27): `bot/tools.ts`
`resolveNoteRecipe` still resolves "tonight's dish" via
`planned_meals.meal_date = today`, which pool writes never set — the
p4-08 note-tonight shortcut silently finds nothing once the pool
migration is live. This plan's bot rework must move that resolution
to `cooked_on = today` (fallback: the remaining pool).

## Progress

- [x] Recipe access mechanism chosen and recorded (2026-08-27 — shared
      loader; Decision Log 1)
- [x] Draft proposer + conversation state machine, unit-tested
      (2026-08-27 — `src/lib/planDraft.ts`, `src/lib/planConversation.ts`)
- [x] Pool drafting: meal list with counts, no day assignment; 🍱 ×2
      meal-prep pair proposed for horizon ≥ 4, correct list scaling
      via the shared aggregation lib (2026-08-27)
- [x] Lock → batch + list generation (shared lib), SEK estimate
      (2026-08-27)
- [x] Swap-with-diff; checked-state preservation (2026-08-27)
- [x] (2026-08-27) Live batch planned + locked by the household —
      Pelle, screenshots in chat: "Jag vill planera de närmaste fem
      dagarna" → draft → pool edits ("Det funkade bra! Jag kunde
      ändra i listan av valda maträtter") → 🔒 Låst! tors 27/8 → mån
      31/8, 5 middagar, 🛒 59 varor ~1475 kr, and the locked pool
      rendering in the web Plan Mode (2026-08-27 → 2026-08-31, 5
      dishes). Live feedback logged as follow-ups: swap-candidate
      variety (same ~5 dishes recur), storkok ×2 in chat + app,
      Plan Mode polish + the /recipes base-path image bug (fixed
      same day in the web).

## Decision Log

1. **Recipe access: shared loader, not a build-time mirror**
   (2026-08-27). The pure half of `src/services/recipeLoader.ts` moved
   to `src/lib/recipeMarkdown.ts` (no Vite-only constructs);
   `recipeLoader.ts` keeps `import.meta.glob` and re-exports it, so no
   web call site changed, and `bot/recipeLibrary.ts` runs the same
   parser over an `fs` read of the same checkout. Why not a mirror: the
   bot itself commits recipe changes through the p4-08/09 write path, so
   a generated mirror would be stale exactly when it matters (between a
   chat edit and the next build), and it would be a second format
   contract to keep in sync with recipe-format.spec.md. The p4-08
   frontmatter regex in `recipePublish.ts` was folded into the shared
   parser at the same time — one reading of the corpus, not two.
2. **The draft is DB state, not session state** (2026-08-27). An open
   draft is `planned_meals` rows with `batch_id IS NULL AND meal_date IS
   NULL`; locking stamps them with the new batch id. Every event
   re-derives from that, and button presses carry their own
   `message_id`, so the whole tap flow survives a consumer restart with
   no session store. The single in-process crumb is the unanswered
   Script 6 diff question (same "ask again" fallback as p4-08's
   `pendingChange`).
3. **Batch range is derived, never asked** (2026-08-27). `starts_on` =
   the first free day from today, following the chain of batches that
   already cover it; `ends_on` = one day per pool entry. A batch further
   out is deliberately *not* jumped over, so a colliding draft hits the
   overlap rejection instead of silently landing after it.
4. **Shopping-row identity = canonical ingredient + unit** (2026-08-27).
   That is what regeneration matches on, so `checked_at` survives a swap;
   the row's canonical name is taken *before* preference resolution, so
   a brand change can never orphan a ticked row. A row the batch no
   longer needs is deleted only when still unchecked — an already-bought
   item stays on the trip it was bought for.
5. **`plan_draft` claimed by the rules layer** (2026-08-27). Script 5's
   entry phrase ("kan vi planera…", "planera 5 dagar", "plan the next 5
   days") now parses with zero model calls, guarded against negations and
   leading shopping verbs. Its `horizon` slot accepts a day COUNT as well
   as a weekday — the pool counts meals, not weekdays — and
   `planEventFromParse` reads both. 4 new fixtures (83 total), all
   rules-claimed, so no LLM cache entries were needed.
6. **`plan_set_day`'s weekday slot is dropped at the action layer**
   (2026-08-27). The NLU still extracts it (fixtures unchanged), but the
   pool has no days to change: "byt torsdag till tacos" becomes "swap
   *something* for tacos" and the bot asks which entry with one tap each.
   Same for `plan_set_multiplier`.

## Steps

1. Pick recipe access (shared loader vs. mirror), record in Context.
2. Conversation state machine (draft horizon → per-day edits → lock)
   as pure logic with unit tests; state survives process restart
   (stateless re-derivation from DB per research-plan C.7 bias).
3. Draft proposer heuristic over ratings/recency; deterministic given
   a seed so tests replay.
4. Lock path: batch row, generate list rows via the shared
   aggregation lib, preference-resolve, announce with estimate from
   `mathemPriceService` (still mock — fine).
5. Swap path with set-difference diff, preserving `checked_at` by
   canonical ingredient; Script 6's diff offer.

## Verification

- `./harness check` passes; conversation state machine and lock/diff
  generation covered by unit tests (including checked-state
  preservation and overlap rejection).
- Fixture conversation replay: the Script 5 tap/text sequence runs
  against a mocked Bot API end-to-end in the test suite.
- Live: the household plans and locks a real batch; the web Shopping
  Summary shows the same list the chat announced.

## Evidence

**2026-08-27 (implementation):**

- `./harness check`: deps OK (73), lint OK (8/8 warnings — baseline
  unchanged), test OK, build OK, tsc bot OK, tsc compare OK, plans
  validate OK (31), validate-recipe OK (30).
- `npx vitest run`: 16 files, **317 tests, all green** — 42 of them new
  (`planDraft` 13, `planShopping` 9, `planConversation` 20), plus
  `intentParser` at 97 with 4 new plan_draft fixtures (83 total) and 5
  new MUST_BE_RULED entries.
- `./harness e2e`: 21 passed (the web is only touched by the
  ShoppingSummary refactor onto the shared `aggregateBatchIngredients`).
- Two bugs the tests caught before any wiring existed: (a) the first
  `nextBatchRange` skipped *past* every locked batch, which made the
  overlap rejection unreachable dead code — rewritten to follow only the
  chain covering today; (b) `show_list` rendered a double space for
  unit-less quantities.
- Adapter smoke (scratchpad `p4-03-adapter-smoke.mts`, the real
  `bot/planning.ts` + `bot/recipeLibrary.ts` against an in-memory fake of
  the postgrest builder that rejects unknown tables, `undefined` columns
  and non-column select expressions) — full Script 5 + Script 6:
  - draft: `🌱 Utkast — 5 middagar i potten:` with 4 dish lines, one
    badged `🍱 ×2`, no weekday anywhere; 5 `planned_meals` rows, all
    `batch_id NULL` and `meal_date NULL`;
  - tap `p:e` → `p:x:0` → `p:s:0:<id>` swapped entry 0 in place; text
    "dubbla portioner" asked which dish, `p:m:4:2` set the multiplier;
  - lock: `🔒 Låst! tors 27/8 → mån 31/8 — 5 middagar, varav 1 🍱 meal
    prep.` + `🛒 Inköpslista: 41 varor, ~654 kr.` + the compassion
    footer; 1 `plan_batches` row, all 5 pool rows stamped, 41
    `shopping_list_items` all carrying `batch_id`;
  - Script 6: two rows ticked, then a swap → list regenerated with
    `➕`/`➖` diff offer, **both ticks survived** (`ticks survived: true`),
    `p:dy` returned the mini-list of added items;
  - every query issued was inspected: only the p4-01/p4-12 columns, all
    scoped `eq(user_id)` (RLS-active shared-user session, no
    service-role key).
- Inherited p4-12 fix verified by construction: `resolveNoteRecipe` now
  reads `cooked_on = today`, then falls back to the current batch's
  remaining pool when it is unambiguous (single distinct dish), and still
  asks otherwise.

**2026-08-27 (live smoke triage — one exoneration, one real latent bug):**

Live sequence (new-code bot's own log, no exceptions): row 11
`intent=plan_draft source=rules` → row 12 `p:h:5` (draft rendered, 5
entries) → 13 `p:e` → 14 `p:x:3` → 15 `p:s:3:vegan-meatballs-creamed-
macaroni` (swap visibly worked) → 16 `p:e` → 17 `p:x:0`, after which the
flow went silent: no options.

- **The conversation logic is exonerated.** That exact tap sequence
  replays clean, twice: `src/lib/planConversation.test.ts`
  ("live-20260827 replay: two edit rounds in one draft") against the
  in-memory store, and `bot/tools.test.ts` ("live-20260827 replay through
  the bot seam") against the *real* Supabase adapter. Every step renders
  a different message with a non-empty keyboard, the second round's
  `p:x:0` included. The replay mock was made strict for this: it models
  Telegram rejecting an edit whose text+markup equal what the message
  already shows ("message is not modified"), since the bot swallows
  telegram errors by design and that rejection would reach the household
  as a dead tap. No rejection occurs.
- **Root cause of the silence: a destructive catch-all in
  `handleCallback`.** Its last statement rewrote the message to the
  p4-02 preference stub for *any* callback_data it did not recognise.
  The stale pre-p4-03 consumer that was draining the same queue in
  parallel knows none of the `p:*` callbacks, so for rows 16/17 it
  overwrote the planning message with "👍 Bara denna gång, då." — which
  is also the source of the duplicate stub replies. Killing that process
  fixed the household's symptom.
- **The same shape was live in current code, and p4-03 had made it
  worse** — a real bug, not just the stale process's: `editMessageText`
  had started sending `reply_markup` unconditionally, so that catch-all
  no longer merely rewrote the text, it *stripped the keyboard*. Any
  deploy skew (a keyboard from an older build, a callback from a newer
  one) would have reproduced the live failure with a single consumer
  running. Fixed both halves: unknown callback_data is now answered and
  ignored (never edited), and `editMessageText` treats an omitted
  `buttons` as "leave the keyboard alone" while `[]` explicitly clears
  it — so text edits and keyboard replacement are separate intents.
  Terminal messages (note confirm/cancel, the preference stub, the
  planning flow's closing lines) pass `[]` on purpose.
- Regression tests, red against the pre-fix code (verified by reverting
  `bot/tools.ts`: 2 failures, then restored): unknown callback_data
  produces zero edits; `remember`/`once` still acknowledge and clear
  their keyboard; and the **one-inbound → bounded-outbound invariant**
  for `plan_draft` — exactly one outbound message, never carrying the
  "🚧 not yet" stub, for both the horizon-stated and horizon-asked
  paths, plus one message + one `answerCallbackQuery` per planning tap.
- Harness gap this closed (AGENTS.md self-improvement rule): the bug
  lived entirely in the bot seam, where no `src/**` test could reach it.
  `vitest.config.ts` include grew `bot/**/*.test.ts`, and the p4-03
  scratchpad adapter smoke is now the committed `bot/tools.test.ts` +
  `bot/fakeSupabase.ts` (a strict in-memory postgrest double that throws
  on unknown tables, non-column select expressions and undefined insert
  values). This also discharges the residual p4-10 recorded in `9be2dfe`.
- `./harness check`: green (lint 8/8 — baseline unchanged, **326 tests
  in 17 files**, build, tsc bot, tsc compare, plans 31, recipes 30).

**Not done here (human):** the live bullet — this checkout has no
`bot/.env` and the live smoke is the household's. Deploy is `git pull` +
bot restart; no new env, no new credentials, no new migration.
