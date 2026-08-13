# R2 — Track A Spike: Findings

Status: complete, 2026-08-13. Spike R2 of
[telegram-pivot-research-plan.md](telegram-pivot-research-plan.md);
kit in [spikes/r2-track-a/](../../spikes/r2-track-a/README.md), live
walkthrough in [LIVE-TEST.md](../../spikes/r2-track-a/LIVE-TEST.md).
Tested live 2026-08-13 with both household members from their phones
(group "Vega 🌱", bot `@vega_plan_bot`) against the production
backend.

## Probe results

| Probe | Result |
| --- | --- |
| Webhook loop (Telegram → edge fn → Postgres → chat) | **Works.** Add / list / check-off all landed as real `shopping_list_items` rows with correct `added_by` attribution; reactions and replies felt fast — no perceived lag on any step. |
| Group privacy mode | **Works with privacy disabled.** Plain-text `köp mjölk` (no slash command) reached the bot in the group after BotFather `/setprivacy` → Disable. Quirk: before the allow-list rows existed, only `/whoami@vega_plan_bot` (explicit @-addressing) drew a reply in the group — correct gate behavior, but easy to mistake for a broken webhook during setup. |
| Inline keyboard + edit-in-place | **Works.** `/plan` → button tap → message edited in place; felt instant and native. No latency objection to chat-first check-off (feeds R5's "chat first, Mini App fallback" call). |
| Cold start | **No disruptive lag observed** across the session, including gaps between test rounds. Not systematically measured with a long idle window; worth a passive eye during continued household use. |
| Allow-list gate (r4 §4 T1) | **Works.** Non-allow-listed senders got silence in the group; `/whoami` answered everyone (by design). |

## Deployment findings (the local dev loop)

The backend turned out to be **Lovable Cloud** — Supabase under the
hood, but not a project under our own Supabase account, so the
Supabase CLI (`login`/`link`/`db push`/`functions deploy`/`secrets`)
cannot target it at all. Consequences for Track A:

- **Deploy path**: commit the function to the GitHub-synced repo →
  prompt Lovable to sync and deploy verbatim. Secrets go in via
  Lovable's Cloud → Secrets form. The p4-01 migration was applied the
  same way (prompt, file run verbatim). It works, but the dev loop is
  slow, conversational, and requires prompt-discipline to keep Lovable
  from "improving" code it deploys.
- **No CLI log tailing** (`supabase functions logs` unavailable);
  debugging relies on Telegram's `getWebhookInfo` (delivery/error
  state) and Lovable's function log view.
- **Bundler restriction**: `deno.land/x/grammy` transitively imports
  `cdn.skypack.dev`, which the edge bundler blocks. Fix:
  `npm:grammy@1.30.0` (same version via npm; no behavior change).
  Applied to the spike source and deployed copy in lockstep.
- `verify_jwt = false` (supabase/config.toml) is required; the
  function's own secret-token check verified live: requests without
  the Telegram secret header are rejected (401 "unauthorized"), with
  it they process (200).

## Gate input (Track A vs B)

- Track A is **viable as transport**: latency, group capture, and
  edit-in-place all pass with real household use.
- The Lovable Cloud dev loop is Track A's real cost — every deploy is
  a Lovable conversation, not a CLI command.
- Household preference stated 2026-08-13: inference should run as a
  **local LLM on the household machine** (Track B topology, r6
  runbook) rather than a hosted model. Weigh at the gate: Track A
  webhook cannot reach a home-hosted LLM; Track B long-polls from the
  machine that hosts the model.

## Out of scope, noted for later

Grocery-store purchase integration from the web admin surface was
raised (2026-08-13) as a desired eventual capability — deliberately
back-burnered until after the P4 assistant ships. New backend surface
⇒ ask-first per AGENTS.md; needs its own spec change + research spike
when picked up.
