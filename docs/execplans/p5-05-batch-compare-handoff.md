---
id: p5-05-batch-compare-handoff
title: Locked batch → compare handoff — price match + Mathem cart from a Claude Code session
phase: P5
status: todo
depends_on: [p4-03-planning-conversation, p5-04-ica-login-history-seeds]
---

## Goal

Close the loop from Telegram to checkout: after the household locks a
batch (p4-03), a human opens a Claude Code session on the M1 and runs
`npm run compare -- --batch latest` (or an explicit batch id). The CLI
signs in with the household account, pulls that batch's
`shopping_list_items` from Supabase, maps them into the p5-01 list
shape (store affinities from `product_preferences` included), and runs
the standard pipeline: per-store totals, fee-aware ranking, 🔁
rotation suggestion, and `--fill-cart mathem` when Mathem wins. The
p4-03 lock announcement gains one line telling the human the exact
handoff command with the batch id. Checkout, slot booking and payment
stay with the human, as always.

## Non-goals

- No bot-initiated compare runs: compare stays human-triggered from a
  Claude Code session (egress allow-list, WAF pacing, and cart review
  all want a human in the loop).
- No new cart integrations — `--fill-cart` remains Mathem-only; other
  winners get the ranked list + store link for manual carting.
- No quantity-aware cart fill: v1 keeps the existing one-unit-per-term
  additive behavior and prints the batch quantities alongside for
  human review (residual risk recorded below).
- No auto-checkout, ever (product.spec boundary).

## Context

The compare CLI (p5-01..04, done) takes a JSON list of search terms
with optional per-item store affinities. `shopping_list_items` rows
(p4-01 schema) carry canonical ingredient name, quantity, unit and
`batch_id`; `product_preferences` carries the household's store
affinities. Auth: reuse the household sign-in pattern from `bot/env.ts`
(mode-600 `.env`, never committed) — `compare/.env` grows
`SUPABASE_URL` + household credentials or shares `bot/.env` (pick in
step 1 and record why). `--batch latest` = most recently locked batch;
already-checked-off rows are excluded (they're bought).

## Progress

- [ ] Credential/source decision recorded (share bot/.env vs. extend
      compare/.env)
- [ ] Batch → compare-list mapping (name, affinity, quantity
      annotation), fixture-tested
- [ ] `--batch <id|latest>` wired through the standard pipeline incl.
      `--fill-cart` and `--record`
- [ ] p4-03 lock announcement includes the handoff command line
- [ ] Live: a real locked batch price-matched and carted from a
      Claude Code session, human checks out

## Steps

1. Decide and record the credential source; sign-in helper shared with
   the bot where practical.
2. Pure mapping function `batchRowsToCompareList` in `src/lib/` (or
   `compare/`, matching where storeCompare.ts logic lives):
   shopping_list_items + product_preferences → p5-01 list entries;
   fixture tests cover affinities, checked-off exclusion, and quantity
   annotations.
3. CLI flag `--batch <id|latest>`: fetch, map, then delegate to the
   existing pipeline unchanged; `--list` and `--batch` are mutually
   exclusive.
4. Extend the p4-03 lock announcement with the handoff line (batch
   short-id + exact command).
5. Live run on the first real locked batch; `--record` the store that
   got the order.

## Verification

- `./harness check` passes; mapping covered by fixture tests
  (affinity, checked-off exclusion, empty batch, unknown-preference
  rows).
- Dry: `--batch <fixture id> --json` against a seeded test batch
  matches the `--list` output for the equivalent hand-written list.
- Live: household locks a batch in Telegram → session here runs
  `--batch latest --fill-cart mathem` → cart URL reviewed → human
  checkout. Residual risk stated in the handoff: cart quantities are
  one unit per term; the printed quantity annotations are the human's
  cue to adjust in the cart before paying.

## Evidence

(recorded during implementation)
