---
id: p4-02-capture-bot
title: "Buy milk" end-to-end — the capture bot on the chosen transport
phase: P4
status: todo
depends_on: [p4-01-schema-rolling-plan]
---

## Goal

The thinnest full loop of the pivot: either partner writes "köp mjölk"
(or variants) in Telegram; the sender passes the `telegram_accounts`
allow-list; the utterance parses to an `add_item` intent (rules first,
LLM fallback); the item lands in `shopping_list_items` (normalized +
preference-resolved at add-time, attributed via `added_by`); the bot
confirms with an emoji reaction. `visa listan` and check-off round out
the minimal loop.

## Non-goals

- No planning conversation, no proactive messages, no preference
  *learning* (reads `product_preferences`, never writes it).
- No group-chat features beyond what the R2 privacy-mode probe proved;
  DM-first is acceptable for v1 if the probe said so.
- No Mini App.

## Context

**Transport (recorded, gate-brief decision 2, 2026-08-14): hybrid
via queue.** Edge function keeps the webhook as always-on capture
(secret-token check → `telegram_accounts` allow-list → enqueue raw
update into `telegram_inbox`); the M1 runtime consumes the queue over
an outbound Realtime subscription, parses with the R3 winner
(qwen3:8b + two-stage harness, `spikes/r3-nlu-bakeoff/run-twostage.mjs`),
writes domain rows, and reacts/replies via outbound HTTPS. No inbound
path to the house; the r6 live week is this plan's live-smoke
verification. Intent contract
and 24 fixtures: `spikes/r3-nlu-bakeoff/` (fixtures.json + the system
prompt in run.mjs). Auth design (RLS-active shared-user session, no
service role): docs/research/r4-data-model-security.md §3. UX
contract: r1-conversation-scripts.md Scripts 1–2 + design.spec.md
"Chat voice". Security: r4 §4–5 apply in full to whichever transport.

## Progress

- [x] Transport decision read from gate-brief; recorded here
      (hybrid via queue — see Context)
- [ ] Intent parser (rules + fallback) with fixture tests in harness
- [ ] Allow-list gate + attribution + add/show/check tools
- [ ] Reaction confirmations; clarify flow for unknown items
- [ ] Live smoke with both household partners

## Steps

1. ~~Record the decided transport~~ (done at dispatch: hybrid via
   queue). Scaffold the capture layer from `spikes/r2-track-a/` and
   the M1 consumer from the r6 runbook; `telegram_inbox` migration
   (household-scoped RLS) shown to the human before it runs.
2. Port the r3 fixture set into the harness as a deterministic unit
   suite (rules-layer must pass without any LLM; LLM-fallback cases
   replay from cached responses per orchestration.spec.md lore).
3. Implement tools: `add_item`, `show_list`, `check_item`,
   `correct_last` — Supabase writes through the shared-user session;
   reuse `src/lib/ingredientNormalization` for canonical linkage.
4. Wire Script 1/2 behavior: reaction on success; one-tap clarify on
   ambiguity; unknown items stored as written with `[Yes, remember]`
   offer stubbed to a no-op.
5. Deploy per transport; run the r4 §5 checklist if Track B; live
   smoke test with both partners' real Telegram accounts.

## Verification

- `./harness check` passes, now including the intent-fixture suite.
- All 24 r3 fixtures: rules-or-cached-LLM parse matches expectation;
  the two must-not-act fixtures (`tack snälla vega!`, `köp inte mer
  kaffe`) provably do not insert rows.
- Live: both partners add an item and see it in the web Shopping
  Summary; an unknown sender id gets silence and a log line.

## Evidence

(recorded during implementation)
