# Vega bot — M1 consumer runtime (p4-02)

The household half of the hybrid transport (gate-brief decision 2):
Telegram → webhook → `telegram-capture` edge function → `telegram_inbox`
queue → **this process** (outbound Realtime subscription + sweep timer)
→ rules-first NLU (qwen3:8b two-stage fallback via local Ollama) →
shopping-list tools → reactions/replies over outbound HTTPS.

Zero inbound ports; every connection is initiated from this machine.
Admin access to the M1 is Tailscale-only (p4-07 — not this plan).

## Prerequisites on the M1

- Node 20+ and `npm install` in the repo root (needs `tsx` + `@supabase/supabase-js`)
- Ollama running with the R3 winner pulled: `ollama pull qwen3:8b`
- The p4-02 migration applied (telegram_inbox) and the `telegram-capture`
  function deployed with the Telegram webhook pointed at it

## Configure

Create `bot/.env` (never committed; `chmod 600 bot/.env`):

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<the publishable anon key from src/integrations/supabase/client.ts>
HOUSEHOLD_EMAIL=<shared household account email>
HOUSEHOLD_PASSWORD=<shared household account password>
TELEGRAM_BOT_TOKEN=<from BotFather>
# optional overrides:
# OLLAMA_URL=http://localhost:11434
# NLU_MODEL=qwen3:8b
# SWEEP_MS=15000
```

## Run

```
npm run bot
```

Watch the log: every processed row prints `intent=… source=rules|llm …ms`
(that log is the live-trial evidence for the R6 verdict, and `[auth] …
TOKEN_REFRESHED` lines are the r4 §3 refresh-longevity evidence).

launchd/keep-alive, lid-closed operation, and the egress allow-list are
p4-07 (`docs/execplans/p4-07-local-runtime-connectivity.md`) — for the
live smoke it's fine to run this in a terminal.
