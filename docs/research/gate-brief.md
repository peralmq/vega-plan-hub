# Human Gate Brief — Telegram Pivot

Status: awaiting the two of you, drafted 2026-07-31. Everything
paper-side of the research phase is done; this page is the one thing to
read before deciding. Per orchestration.spec.md this is an escalation
brief: decisions get recorded here, then specs change, then P4 plans.

## Where every spike stands

| Spike | State | Your part |
| --- | --- | --- |
| R1 scripts | ✅ drafted — [r1-conversation-scripts.md](r1-conversation-scripts.md) | **Dry-run** (protocol in the doc), fill the verdict table |
| R2 Track A | 🧰 kit staged — [spikes/r2-track-a/](../../spikes/r2-track-a/README.md) | Create the bot at @BotFather (2 min), then ~15 min of steps |
| R3 bake-off | 🧰 kit built + self-tested (24/24 mock) — [spikes/r3-nlu-bakeoff/](../../spikes/r3-nlu-bakeoff/README.md) | Run on the **M1** (this repo's dev box is an M3 Pro — numbers from it don't count) |
| R4 schema + security | ✅ drafted — [r4-data-model-security.md](r4-data-model-security.md) | Approve/adjust §6's four calls |
| R5 surface split | ✅ drafted with provisional calls — [r5-surface-split.md](r5-surface-split.md) | Sanity-check the table |
| R6 Track B | 📋 runbook ready — [r6-track-b-runbook.md](r6-track-b-runbook.md) | Executable after R3 picks the model |

## Decisions already made (recorded, reversible only by you)

1. Shared single account; Telegram ids allow-listed → family members.
2. Rolling "next X days" batches, not calendar weeks.
3. Emoji-reaction confirmations; bot speaks only when adding info.
4. Preference learning with structured rows as store of record.
5. Target hardware: MacBook Pro M1 16 GB; preferred model:
   TurboFieldfare/Gemma 4 (pending R3's three risk checks).
6. Security: sandboxed, no inbound ports, no third-party skills.

## Decisions this gate must produce

1. **Pivot vs. extension** — recommendation: *extension* (web keeps
   cook mode/library/admin per R5; chat owns capture + planning).
2. **Track A vs. Track B vs. hybrid** — wait for R2 + R6 evidence;
   the runbook's live-trial log is the tiebreaker. Hybrid (edge
   function for capture, laptop for smarts) is a legitimate outcome.
3. **Spec revisions** (human-authored per AGENTS.md):
   product.spec.md — drop "responsive web only", add chat-first jobs +
   rolling batches; tech.spec.md — new tables (R4 §1), bot surface;
   AGENTS.md — reword the "no new backend surface" non-goal;
   design.spec.md — chat voice (A.7 verdict: English or Swedish).
4. **R4 §6's four schema calls** (preference resolution timing, adhoc
   batch attachment, per-person preferences, session-vs-service-role).
5. **Name the bot** (scripts say "Vega" 🌱 — rename at BotFather
   anytime).

## Proposed P4 backlog (post-gate, in order)

1. `p4-01-schema-rolling-plan` — R4 tables + migration + web Plan Mode
   re-pointing (biggest, most reversible-averse — goes first).
2. `p4-02-capture-bot` — "buy milk" end-to-end on the chosen track,
   harness gains intent-fixture tests (the R3 kit graduates from
   spike to `./harness` check).
3. `p4-03-planning-conversation` — the Script 5 batch ritual.
4. `p4-04-preference-learning` — Script 3 flows writing
   `product_preferences`; admin "what the bot believes" page.
5. `p4-05-proactive-pulse` — runs-low nudge, tonight ping, ratings.
