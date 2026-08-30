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

## Planning conversation (p4-03)

"planera 5 dagar" (or "kan vi planera de närmsta dagarna?" → tap a
horizon) → a **pool draft**: a list of dishes with counts, one of them a
🍱 ×2 meal prep, no day assignments. Edit it by tap (`✏️ Ändra` → dish →
swap / portions / remove) or by text ("byt X till tacos", "dubbla
portioner"), then `✅ Lås N dagar` writes the `plan_batches` row, stamps
the pool, and generates the batch's `shopping_list_items` — announced
with the item count and a ~SEK estimate. One partner's lock is enough
(r1 A.3); the other can still swap afterwards, which regenerates the
list while keeping every already-ticked row.

Edits reach the **whole** library: the swap picker pages through it with
[Fler förslag ➡️], 🎲 Ny dragning rotates round by round (excluding every
dish earlier rounds offered), and free text is the escape hatch a keyboard
can never be — "byt dalen mot pyttipanna", "byt till mapo tofu". Say
"storkok på dalen" (or tap 🍱 Gör till storkok) to make a dish a big batch:
the same recipe twice in the pool, cook once and eat twice — never a bigger
servings multiplier, which stays family-size.

No extra prerequisites: it reuses `RECIPE_REPO_DIR` for the recipe
library (same checkout, same parser as the web app) and the schema is
p4-01 + the p4-12 pool delta. The draft lives in `planned_meals`
(`batch_id IS NULL AND meal_date IS NULL`), so restarting this process
mid-conversation loses nothing — the next tap picks up where it was.

## NLU trace capture (p4-06)

Every message the assistant parses writes a row to `nlu_traces`
(utterance, parse, model, harness_version, latency_ms) — write-on-parse
degrades gracefully (log-and-continue) if the migration is missing, so
it is safe to deploy ahead of applying it. `nej, X` (correct_last)
overturns the trace behind the insert it fixed to `implicit_wrong`,
with the repair recorded as `corrected_parse`. Two more pieces run
outside the message loop:

- **`/traces`** (private chat): up to 5 unsettled traces, one message
  each, `[✅ rätt]` / `[❌ fel]` — one tap either way, stateless (the
  trace id rides in `callback_data`, so it survives a restart).
- **Nightly sweep**: unsettled traces older than 48h default to
  `implicit_correct` (silence = the action stood). Run via cron:
  ```
  0 4 * * * cd /path/to/checkout && npx tsx bot/nluSweep.ts >> nlu-sweep.log 2>&1
  ```
- **Export**: `npx tsx bot/nluExport.ts` turns `confirmed_correct` /
  `confirmed_wrong` traces into an r3-kit-format fixture file
  (`spikes/r3-nlu-bakeoff/fixtures-live-<date>.json`), scoreable with
  the bake-off runners, e.g.
  `node spikes/r3-nlu-bakeoff/run.mjs --mock --fixtures fixtures-live-<date>.json`
  or a real model via `run-twostage.mjs --fixtures …`.

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
