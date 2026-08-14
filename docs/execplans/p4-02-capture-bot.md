---
id: p4-02-capture-bot
title: "Buy milk" end-to-end — the capture bot on the chosen transport
phase: P4
status: in-progress
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
- [x] Intent parser (rules + fallback) with fixture tests in harness
- [x] Allow-list gate + attribution + add/show/check tools
- [x] Reaction confirmations; clarify flow for unknown items
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

**2026-08-14 (implementation, pre-deploy):**

- Parser seam graduated from the r3 kit: `src/lib/intentParser.ts`
  (rules layer + two-stage prompts/postProcess ported verbatim),
  `src/lib/botActions.ts` (pure action planner — the enumerable-tool
  guarantee as code). All 68 r3 fixtures (24 original + 44 held-out)
  committed to `src/lib/__fixtures__/intent-fixtures.json` and run on
  every `./harness check` via `src/lib/intentParser.test.ts`
  (77 tests): rules claim 44/68 deterministically (every capture-path
  intent — zero model calls for Script 1/2 phrasings, including the
  diacritic-repair and negation-trap rows the LLM used to miss); the
  remaining 24 replay through the real two-stage pipeline against the
  committed qwen3:8b winning-run outputs
  (`src/lib/__fixtures__/intent-llm-cache.json`, cache-first per
  orchestration lore). The R3 "zero wrong intents" invariant is
  asserted for every fixture; the single known slot miss (oatly →
  mjölk ingredient inference, a p4-04 feature) is pinned so new misses
  fail.
- Must-not-act: `tack snälla vega!` → chitchat and `köp inte mer
  kaffe` → remove_item are proven at the parser AND at the action
  planner (`planActions` emits zero write actions / no insert) —
  deterministic, in the unit suite.
- Capture layer: `supabase/functions/telegram-capture/index.ts` —
  secret-token check → allow-list (silence + log for unknowns, never
  enqueued) → verbatim enqueue into `telegram_inbox` (update_id
  dedupe); household-user session auth (r4 §3), no service role.
  Migration: `supabase/migrations/20260814090000_p4_02_telegram_inbox.sql`.
- M1 consumer: `bot/` (`npm run bot`) — outbound Realtime subscription
  + sweep timer wake a single-flight drain over `processed_at IS
  NULL` (wake-signal races cannot double-process); rules-first parse,
  qwen3:8b two-stage fallback via local Ollama; tools add / show /
  check / remove / correct_last with add-time preference resolution
  and Script 2's unknown-item clarify ([Yes, remember] stubbed no-op);
  reactions 👍/👌/🫡 (Telegram's allowed-reaction set has no 🥛 — 
  Script 1's item-emoji fantasy is an API impossibility, R2's 👍 
  stands). Auth refresh events are logged (r4 §3 longevity evidence 
  accrues during the live week).
- Harness: new `tsc bot` step in `./harness check` (vite build never
  typechecked `bot/` — self-improvement rule). `./harness check`:
  deps OK (73), lint OK, test OK (77), build OK, tsc bot OK, plans
  validate OK (18), validate-recipe OK (30).
- Scope note: `remove_item` implemented beyond the plan's four listed
  tools — it is in r4 §4 T2's enumerable tool list, and its negation
  traps are fixtures; a capture bot that can't take items off the
  list fails the household in week one.

**2026-08-14 (live round 1):** deployed end-to-end (webhook →
telegram-capture → telegram_inbox → M1 consumer). Setup findings:
project auth needed the email provider enabled (Google-OAuth-born
household user got a password identity via admin API — the r4 §3
"dedicated password-grant identity" made real); capture-fn secrets
must exist *and* the function redeployed to see them. First real
usage (log): `[row 1] intent=add_item source=rules 531ms "Köp
havremjölk"`, four show_list phrasings via LLM 1.6–6.7 s all correct
intent, `TOKEN_REFRESHED` observed (r4 §3 evidence accruing).
Feedback applied same day: Swedish milk-variant aliases in
`ingredientNormalization` (havremjölk → mjölk so preferences span
variants), show_list rules broadened with the real phrasings (now
fixtures, set `live-20260814`, 72 total), and replies mirror the
sender's language with Swedish default (design.spec Chat voice A.7
verdict recorded from live use — spec updated in this change set).

(live smoke with both partners still pending — see Steps 5)
