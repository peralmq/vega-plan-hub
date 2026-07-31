# R2 Track A spike — throwaway echo-bot on Supabase Edge Functions

Spike R2 of
[../../docs/research/telegram-pivot-research-plan.md](../../docs/research/telegram-pivot-research-plan.md).
Everything is staged here (not in `supabase/functions/` — the real tree
stays untouched until the human gate). Total hands-on time ≈ 15 min.

## What this spike must answer

1. Webhook round-trip latency (send → bot reply) — feels instant?
2. **Emoji-reaction confirmations** (the 2026-07-31 directive) — does
   `setMessageReaction` work from grammY on Edge Functions?
3. Inline-keyboard + edit-in-place ergonomics (Script 5/7 patterns).
4. Group **privacy mode** reality: with privacy ON, which plain
   messages does the bot actually see in your three-way group? (This
   decides A.1 group-first feasibility — "köp mjölk" must arrive
   without a leading `/`.)
5. Local dev loop quality (`supabase functions serve` + a tunnel).

## Step 1 — human-only: create the bot (2 min, on your phone)

Talk to [@BotFather](https://t.me/botfather): `/newbot` → name it
(e.g. "Vega 🌱") → copy the token. Then, for the group test:
`/setprivacy` → **Disable** (so the bot sees plain group messages —
re-enable later if the DM model wins). Add the bot to a test group
with both of you.

## Step 2 — deploy the echo function

```bash
supabase functions new telegram-spike
cp spikes/r2-track-a/index.ts supabase/functions/telegram-spike/index.ts
supabase secrets set TELEGRAM_BOT_TOKEN=<token> FUNCTION_SECRET=$(openssl rand -hex 16)
supabase functions deploy telegram-spike --no-verify-jwt
```

Register the webhook (secret_token defends against forged calls):

```bash
curl "https://api.telegram.org/bot<token>/setWebhook" \
  -d "url=https://<project-ref>.supabase.co/functions/v1/telegram-spike" \
  -d "secret_token=<FUNCTION_SECRET value>"
```

The function code is [index.ts](index.ts) in this directory (the `cp`
above stages it) — four probes: reaction on `köp …`, `/plan` inline
keyboard, edit-in-place on button tap, echo-with-chat-info for the
privacy-mode test.

## Step 3 — run the probes, record findings

Create `docs/research/r2-track-a-spike.md` with: reply latency felt /
measured, reaction support verdict, edit-in-place verdict, exactly
which group messages arrived with privacy disabled (and, re-enabled,
which stop arriving), cold-start feel after idle. Then either delete
the function (`supabase functions delete telegram-spike`) or leave it
as the R6 comparison baseline.
