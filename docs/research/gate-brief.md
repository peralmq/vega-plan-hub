# Human Gate Brief — Telegram Pivot

Status: **gate passed 2026-07-31** — user approved execution in chat
("Do it"), same day as drafting. Decisions recorded below; specs
revised and P4 execplans created in the same change set per
AGENTS.md. Remaining open items are evidence-gated, not
decision-gated, and are marked ⏳.

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

## Gate outcomes (recorded 2026-07-31, user approval via chat)

1. **Pivot vs. extension** — ✅ **Extension**: web keeps cook
   mode/library/admin/print per R5; chat owns capture + planning.
2. **Track A vs. Track B vs. hybrid** — ✅ **Hybrid via queue**
   (recorded 2026-08-14, user approval via chat). The Track A edge
   function keeps the Telegram webhook as always-on capture: it
   validates the secret token, applies the `telegram_accounts`
   allow-list, and enqueues accepted raw updates into a new
   `telegram_inbox` table (joins the approved schema set —
   tech.spec.md updated in this change set). The M1 runtime (Track B
   topology per the r6 runbook) holds an *outbound* Supabase Realtime
   subscription, parses with the R3 winning recipe (qwen3:8b +
   two-stage harness), writes domain rows, and replies/reacts via
   outbound HTTPS to the Telegram API. No inbound path to the house —
   a Tailscale-fronted edge→M1 call was considered and rejected (edge
   functions cannot join a tailnet; Funnel would be public inbound);
   Tailscale remains admin-access-only per p4-07. Evidence: R2
   (Track A viable as capture; webhook cannot reach a home LLM), R3
   (local recipe proven on the M1), household preference for local
   inference. The r6 one-tool live week folds into p4-02's
   verification; the r6 sandbox/egress checklist still binds the M1
   runtime.
3. **Spec revisions** — ✅ done in the gate change set:
   product.spec.md (chat-first jobs, rolling batches, "responsive web
   only" retired), tech.spec.md ("Chat assistant" contract section),
   AGENTS.md (backend-surface non-goal reworded), design.spec.md
   ("Chat voice" section; English default pending the A.7 dry-run
   verdict).
4. **R4 §6 schema calls** — ✅ adopted as proposed: add-time
   preference resolution; ad-hoc items batchless (gathered by
   shopping mode); per-person preference column kept, written null;
   session-auth over service-role ⏳ pending the R6 refresh-token
   longevity check (fallback documented in r4 §3).
5. **Bot name** — "Vega" 🌱 as working default; rename at BotFather
   anytime.

Dry-run verdicts (A.1–A.8) remain valuable but no longer block the
backlog: p4-02..05 read the filled verdict table at dispatch and fall
back to the scripts' defaults where a row is empty.

## P4 backlog (created at the gate — see docs/execplans/)

1. `p4-01-schema-rolling-plan` — R4 tables + migration + web
   re-pointing (dispatchable now, no dependencies).
2. `p4-02-capture-bot` — "buy milk" end-to-end on the chosen track;
   the R3 kit graduates into `./harness`.
3. `p4-03-planning-conversation` — the Script 5 batch ritual.
4. `p4-04-preference-learning` — Script 3 flows + admin "what the bot
   believes" page.
5. `p4-05-proactive-pulse` — runs-low nudge, tonight ping, ratings.
