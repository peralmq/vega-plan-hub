---
id: p4-03-planning-conversation
title: The rolling planning conversation — draft, edit, lock a batch
phase: P4
status: todo
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

## Progress

- [ ] Recipe access mechanism chosen and recorded
- [ ] Draft proposer + conversation state machine, unit-tested
- [ ] Lock → batch + list generation (shared lib), SEK estimate
- [ ] Swap-with-diff; checked-state preservation
- [ ] Live batch planned + locked by the household

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

(recorded during implementation)
