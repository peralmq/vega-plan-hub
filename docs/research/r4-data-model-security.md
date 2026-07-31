# R4 — Data Model, Identity & Security Design

Status: draft, 2026-07-31. Spike R4 of
[telegram-pivot-research-plan.md](telegram-pivot-research-plan.md).
Schema is a **proposal for the human gate** — every table here is an
ask-first change per tech.spec.md boundaries. Incorporates the
2026-07-31 directives: shared account, rolling next-X-days batches,
preference learning with structured store-of-record.

## 1. Schema proposal

All tables keyed by the (single, shared) auth `user_id`, RLS-scoped
exactly like the existing tables. New tables only — the two existing
plan tables are *replaced* (migration in §2).

```sql
-- Who is talking on Telegram → which family member (allow-list + attribution)
create table telegram_accounts (
  telegram_user_id bigint primary key,
  user_id          uuid not null references auth.users(id),
  family_member_id uuid not null references family_members(id),
  display_name     text,
  active           boolean not null default true
);

-- Rolling plan: one row per planned day (replaces meal_plans + daily_meals)
create table planned_meals (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id),
  meal_date            date not null,
  recipe_id            text not null,          -- markdown recipe id (client/bot join)
  servings_multiplier  numeric not null default 1,
  batch_id             uuid references plan_batches(id),  -- null = drafted, not locked
  created_by           uuid references family_members(id),
  unique (user_id, meal_date)
);

-- A lock event = a batch of days planned + shopped together
create table plan_batches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  starts_on   date not null,
  ends_on     date not null,
  locked_at   timestamptz not null default now(),
  locked_by   uuid references family_members(id)
);

-- The persisted shopping list (recipe-derived rows regenerate per batch; adhoc rows free-floating)
create table shopping_list_items (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id),
  source               text not null check (source in ('recipe','adhoc')),
  batch_id             uuid references plan_batches(id),   -- null for adhoc
  canonical_ingredient text,          -- null when normalization has no match
  display_name         text not null, -- what the human sees ("iKaffe", "diskmedel")
  quantity             numeric,
  unit                 text,
  note                 text,          -- "till lördag"
  added_by             uuid references family_members(id),
  checked_at           timestamptz,
  checked_by           uuid references family_members(id),
  created_at           timestamptz not null default now()
);

-- Store of record for "which product does <ingredient> mean right now"
create table product_preferences (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id),
  canonical_ingredient text not null,
  product_name         text not null,          -- "ICA Havredryck"
  family_member_id     uuid references family_members(id), -- null = household-wide
  valid_from           timestamptz not null default now(),
  superseded_by        uuid references product_preferences(id), -- null = current
  source               text not null check (source in ('explicit','correction','observed')),
  note                 text
);
```

Design points worth defending at the gate:

- **Dates, not week+day-of-week** — `planned_meals.meal_date` makes the
  rolling "next X days" model native; the web Plan Mode renders any
  week window over it, and "tonight" is a `where meal_date =
  current_date` lookup.
- **Preference history is append-only** — a change *supersedes* rather
  than updates, so "was: Oatly since March" (Script 3's trust move) is
  a real query, and `[Undo]` is just re-pointing `superseded_by`.
- **`display_name` vs `canonical_ingredient`** — the bot must accept
  items normalization has never heard of ("nutritional yeast") without
  blocking; canonical linkage is best-effort enrichment, reusing
  `src/lib/ingredientNormalization` (shared-logic directive).
- **Recipe-derived rows regenerate on batch edit** (Script 6's diff =
  set difference between old and new generation, *preserving*
  checked-off state by canonical ingredient).
- **Episodic agent memory is deliberately absent** from this schema —
  if Track B's runtime needs one beyond its own store, it gets a
  separate pgvector table with a retention policy, and *never* feeds
  the list directly (structured facts get promoted into
  `product_preferences` / `shopping_list_items` via tools).

## 2. Migration sketch

1. Create new tables + RLS policies (same `user_id = auth.uid()`
   pattern as existing).
2. Backfill: for each `meal_plans` row × `daily_meals` child,
   `meal_date = week_start + day_of_week` → insert into
   `planned_meals` (no batch — historical rows were never "locked").
3. Web app: point `useMealPlanDB` at `planned_meals` keeping the
   week-window UI; drop old tables in a later migration once stable.
4. Seed `product_preferences` by hand in week one (the two of you
   listing your usuals seeds faster than any learning loop).

## 3. Identity & authorization — the RLS-preserving trick

Because the household shares **one** Supabase user, the bot does not
need the service-role key at all: it can hold a **session for that one
user** (stored refresh token, e.g. from a dedicated password-grant
identity linked to the same account) and go through PostgREST **with
RLS fully active**, exactly like the web app. The blast radius of a
compromised bot then equals the household's own data — not the
project's admin plane.

- Authorization = `telegram_accounts` allow-list checked on **every**
  update before any tool runs; unknown senders get silence (no "try
  again" oracle), plus a log line.
- Attribution = the same lookup's `family_member_id` stamped on
  `added_by` / `checked_by` / `locked_by` / preference rows.
- The service-role key stays where it is today: nowhere.

Verify in R6: Supabase session refresh longevity for a headless client
(refresh-token rotation behavior on a long-lived daemon) — fallback is
service-role + a hand-rolled table allow-list in the tool layer, which
is strictly worse and must be argued for, not defaulted to.

## 4. Threat model

Assets: bot token; Supabase session/refresh token; household data
(meals, list, preferences — low sensitivity but private); the laptop
itself (Track B).

| # | Threat | Vector | Mitigation |
| --- | --- | --- | --- |
| T1 | Stranger drives the bot | Anyone can message any bot; bot ids are guessable | Allow-list gate before any parsing (§3); silence to unknowns; alert the group on repeated unknown senders |
| T2 | Prompt injection → unwanted writes | Free text in chat; recipe/comment text fed into prompts | Narrow enumerable tools only (add/remove/check item, set plan day, set multiplier, lock batch, set preference — **no shell, no browser, no arbitrary SQL**); chat confirmation for destructive ops (clear list, unlock); recipe/comment text summarized, never given tool access |
| T3 | Runtime compromise (Track B) | Runtime CVE; malicious dependency/skill | Sandbox baseline §5; no third-party skills; RLS-scoped session bounds blast radius to household data; pinned deps |
| T4 | Token theft | Repo leak, laptop theft, exposed dashboard | Secrets in env/keychain only (existing 🚫 repo rule); FileVault on the laptop; dashboard LAN/Tailscale only; both tokens revocable (BotFather / Supabase session revoke) — write the revocation runbook |
| T5 | Exposed ingress | Open webhook port on home network | **Long-polling, zero inbound ports** (the decisive argument for polling over webhook on Track B); Track A webhook uses Telegram's `secret_token` header check |
| T6 | LLM data exfiltration | Model/runtime phones home | Local model = no prompt leaves the machine (the point of Track B); default-deny egress makes it enforced, not assumed |
| T7 | Chat-platform trust | Telegram sees all message content | Accepted residual risk — the household already chats there; no secrets ever in bot messages |

## 5. Sandbox deployment checklist (Track B gate — R6 must verify each ✅ as deployed)

- [ ] Runtime in a container/VM; host account is a dedicated
      non-admin macOS user.
- [ ] **No inbound ports** — `lsof -i -P | grep LISTEN` shows nothing
      new; ingress is outbound long-polling only.
- [ ] Default-deny egress; allow-list exactly `api.telegram.org` +
      `*.supabase.co` (+ nothing for the LLM — it's local).
- [ ] Admin/dashboard bound to localhost; remote access via Tailscale
      only; never port-forwarded.
- [ ] No third-party skill/plugin marketplace enabled; tool list is
      enumerable in one screen of our code.
- [ ] Secrets via env/keychain; `git grep` for tokens comes back empty;
      revocation runbook written and tested once.
- [ ] Container: no-new-privileges, read-only root where the runtime
      allows, resource-limited (the laptop is also a laptop).
- [ ] launchd keeps runtime + Ollama/TurboFieldfare server alive;
      lid-closed operation verified (`caffeinate`/pmset); behavior on
      wake-from-sleep tested.
- [ ] Backup: nightly `pg_dump` of the Supabase project (or CLI
      export) somewhere that isn't the same laptop.

## 6. Open questions for the gate

1. Preference resolution timing: resolve `mjölk` → product at
   **add-time** (list shows the product; historical rows immutable) or
   **display-time** (list always reflects current preference)?
   Proposal: add-time, because the list is a record of intent — but
   dry-run Script 3 may say otherwise.
2. Do adhoc items auto-attach to the *open* batch (so they appear in
   the store trip) or stay batchless until shopping mode gathers
   everything unchecked? Proposal: batchless + gather-on-🛒.
3. Is `family_member_id` on preferences worth it in v0, or is
   household-wide enough until a real per-person case appears?
   Proposal: keep the column, always write null.
4. Session-vs-service-role (§3) pending the R6 refresh-token
   longevity check.
