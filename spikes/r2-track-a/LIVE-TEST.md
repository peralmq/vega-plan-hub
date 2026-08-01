# Live end-to-end test — Telegram → Supabase, for both of you

Follow top to bottom; ~30 minutes total, phone + laptop. At the end,
either of you can write **"köp mjölk"** in Telegram and it lands as a
real row in your Supabase, attributed to whoever sent it, listable and
check-off-able from chat.

What this is: the dev/spike capture bot ([index.ts](index.ts)) — three
real tools (add / show / check-off) plus the R2 platform probes. What
it is not yet: preference resolution, planning conversations, the web
list view (Shopping Summary still shows recipe-derived items only;
ad-hoc rows are visible in chat and the Supabase Table Editor).

> Spike-only security note: the function uses the service-role key
> Supabase injects into edge functions (it never leaves Supabase
> infra), behind a hard `telegram_accounts` allow-list — unknown
> senders get silence. The production bot (p4-02) switches to
> shared-user session auth per tech.spec.md.

## Step 0 — prerequisites (laptop)

- Supabase CLI installed and logged in:

```bash
supabase login
```

- Link the repo to your project (ref = the id in your dashboard URL,
  `https://supabase.com/dashboard/project/<ref>`):

```bash
supabase link --project-ref <ref>
```

## Step 1 — apply the p4-01 migration (required once)

The bot writes to `shopping_list_items` and reads `telegram_accounts` —
both created by the migration:

```bash
supabase db push
```

(Or paste `supabase/migrations/20260731200000_p4_01_rolling_plan_schema.sql`
into the dashboard SQL Editor and run it.)

## Step 2 — create the bot (phone, 2 min)

1. Message [@BotFather](https://t.me/botfather): `/newbot` → name it
   (display name "Vega 🌱", username something like `vega_plan_dev_bot`).
2. Copy the token it gives you.
3. Still in BotFather: `/setprivacy` → select your bot → **Disable**
   (so the bot sees plain "köp mjölk" messages in a group).

## Step 3 — deploy the function (laptop)

```bash
supabase functions new telegram-spike
```

```bash
cp spikes/r2-track-a/index.ts supabase/functions/telegram-spike/index.ts
```

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=<your token> FUNCTION_SECRET=$(openssl rand -hex 16)
```

```bash
supabase functions deploy telegram-spike --no-verify-jwt
```

Point Telegram at it (fill in the token, your project ref, and the same
FUNCTION_SECRET value — `supabase secrets list` shows it is set, use the
value you generated):

```bash
curl "https://api.telegram.org/bot<token>/setWebhook" -d "url=https://<ref>.supabase.co/functions/v1/telegram-spike" -d "secret_token=<FUNCTION_SECRET value>"
```

Expect `{"ok":true,...,"description":"Webhook was set"}`.

## Step 4 — allow-list the two of you

1. Both of you: open the bot in Telegram, press Start, send `/whoami`.
   It replies with your numeric Telegram id (this is the only thing it
   does for strangers — everything else is silence until you're in the
   table).
2. Dashboard → SQL Editor. First check whether you already have family
   members (you may have created them in the app's Account page):

```sql
select id, name from family_members;
```

   If the two of you aren't there, create them (find your user id with
   `select id, email from auth.users;`):

```sql
insert into family_members (user_id, name)
values ('<USER_ID>', 'Pelle'), ('<USER_ID>', '<WIFE_NAME>')
returning id, name;
```

3. Now bind Telegram ids → family members:

```sql
insert into telegram_accounts (telegram_user_id, user_id, family_member_id, display_name)
values
  (<PELLE_TG_ID>, '<USER_ID>', '<PELLE_FM_ID>', 'Pelle'),
  (<WIFE_TG_ID>,  '<USER_ID>', '<WIFE_FM_ID>',  '<WIFE_NAME>');
```

## Step 5 — the end-to-end test script

Create a group with the three of you (you two + the bot) — "🥗
Matcentralen dev". Then, mixing who sends what:

| # | Send | Expect |
| --- | --- | --- |
| 1 | `köp mjölk` (her) | 👍 reaction on her message, no reply |
| 2 | `buy toilet paper and coffee` (you) | 👍 reaction; two items stored |
| 3 | `visa listan` (either) | 🛒 list of 3 with who added each |
| 4 | `bocka av mjölk` (you) | 👌 reaction |
| 5 | `visa listan` | 2 items left |
| 6 | `/plan` → tap a button | message edits in place — the R2 probe |
| 7 | Any other text | silence in the group (logged); in a DM, a help message |
| 8 | Optional: a third person messages the bot | total silence — the allow-list working |

Verify the ground truth: dashboard → Table Editor →
`shopping_list_items` — rows with `added_by` set, `checked_at` on the
milk. That's the full loop: **Telegram → edge function → allow-list →
Postgres → back to chat.**

While you're at it, note the R2 findings (they decide Track A vs B):
reply/reaction latency feel, whether plain group messages arrived with
privacy disabled, edit-in-place feel, cold-start lag after ~15 idle
minutes. Jot them in `docs/research/r2-track-a-spike.md`.

## Debugging

```bash
supabase functions logs telegram-spike
```

- No reaction at all → check `curl "https://api.telegram.org/bot<token>/getWebhookInfo"` (pending errors show here).
- "😵 Couldn't save" → the migration isn't applied or the insert hit a
  constraint — the logs have the exact error.
- Silence from the bot for *you* → your `telegram_accounts` row is
  missing/inactive or the id is wrong (`/whoami` again, compare).

## Cleanup / rollback (when done testing)

```bash
curl "https://api.telegram.org/bot<token>/deleteWebhook"
```

```bash
supabase functions delete telegram-spike
```

List rows are real data in your project — keep them or clear with
`delete from shopping_list_items;` in the SQL editor.
