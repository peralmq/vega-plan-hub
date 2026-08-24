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
# p4-08 recipe notes:
# RECIPE_REPO_DIR=<checkout to publish from; default: this checkout>
# RECIPE_PUSH=0   # commit-only dry run (no push) — useful for first smoke
```

## Recipe notes (p4-08)

"mindre stark nästa gång" → confirm button → note appended to the
recipe's `## Notes`, validated (`./harness validate-recipe`), committed
and pushed to `main`; CI + Pages make it live in CookMode in ~1–2 min.
Extra prerequisites beyond p4-02:

- The checkout in `RECIPE_REPO_DIR` must be able to `git pull --rebase`
  and `git push origin main`: a repo-scoped **deploy key** (or the
  household git credentials) on the M1, per the tech.spec "Recipe
  notes" contract — key material stays out of the repo.
- `github.com` added to the egress allow-list (r6 runbook amendment).
- Git author identity set in the checkout (`git config user.name/email`).

First smoke: set `RECIPE_PUSH=0`, send a note, press [Ja, spara],
inspect the local commit; then unset and go live.

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
