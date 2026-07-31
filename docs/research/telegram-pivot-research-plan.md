# Research Plan — Telegram-First Conversational Pivot

Status: draft research plan, 2026-07-31. Not binding. This document
frames the research for pivoting (or extending) Vega Plan Hub from a
web-first SPA to a **chat-first household assistant on Telegram**, with
the web retained for the surfaces where a big screen wins. Nothing here
changes a spec; every spec collision found below is an explicit
ask-first item per [AGENTS.md](../../AGENTS.md).

## 1. Motivation and vision hypothesis

The household (two adults) wants to interact with the recipe bank, meal
planner, and shopping list **conversationally**, in the app where they
already talk to each other — Telegram — instead of opening a website.

Canonical moments the pivot must serve:

- *"buy milk"* → milk lands on a shared shopping list, instantly, from
  either partner, mid-conversation, one-handed, in the store or on the
  couch.
- A short back-and-forth conversation → next week's meal plan gets
  **locked down** (what we cook *and* what we shop for).
- *"what's for dinner tonight?"* → tonight's planned meal, right there
  in chat.

Hypothesis to validate: **capture and coordination belong in chat;
consumption of dense content (cooking steps, recipe browsing, admin)
belongs on a bigger screen.** The research below is structured to
confirm, refute, or refine that split.

## 2. What the current system gives us — and where it collides

Ground truth from the specs and code (verified 2026-07-31):

| Current fact | Consequence for the pivot |
| --- | --- |
| Data is **per-user** — `meal_plans` etc. are keyed by the Supabase auth user ([tech.spec.md](../specs/tech.spec.md)) | Two partners can't see one shared plan today. The pivot needs a **household** concept — the single biggest data-model change. |
| The shopping list is **derived, never persisted** — aggregated client-side from the week's recipes | "buy milk" (an ad-hoc item) has nowhere to live. Needs a persisted `shopping_list_items` table with both recipe-derived and ad-hoc rows, plus check-off state. |
| Recipes are **markdown bundled into the SPA at build time** (`import.meta.glob`) | A bot backend can't read them at runtime. Needs a runtime-accessible recipe source (build-published JSON artifact, DB mirror, or repo fetch). |
| Auth is Supabase Google OAuth; identity = Google account | Telegram identity is a numeric user id. Needs an **identity-linking** story (Telegram id ↔ Supabase user ↔ household). |
| Non-goal in AGENTS.md: "No new backend surface beyond Supabase" | A bot webhook **is** a new backend surface. Supabase Edge Functions arguably stay inside the boundary, but this is a spec change a human must sign off. |
| Product spec non-goal: "No native mobile app; responsive web only" | Chat-first reframes this non-goal; product.spec.md needs a human-approved revision. |
| Playful, emoji-filled identity is a product requirement | Happily, chat is the *native* home of that identity — emoji reactions, sticker-adjacent tone. The design spec's voice should port, not reset. |

## 3. Research dimensions

### A. User experience & interaction design (the core bet)

The interaction model of a good household bot is a genuinely different
design discipline from a SPA. Questions to research:

1. **Group chat vs. 1:1 chats.** Should the bot live in a shared
   three-way group ("family HQ") where both partners see every
   interaction, or in individual DMs with shared state behind the
   scenes — or both? Group = ambient awareness ("she already added
   milk"); DM = less noise. What do successful household bots do?
2. **Free text vs. structured input.** Where is natural language worth
   it ("buy milk", "swap Thursday to tacos") vs. where do Telegram's
   inline keyboards / reply buttons beat typing (picking one of 18
   recipes, confirming a plan)? Hypothesis: **free text to capture,
   buttons to choose, one tap to confirm.**
3. **The weekly planning ritual.** Design the conversation that locks a
   week: does the bot propose a draft plan (from ratings, recency,
   season) that the humans edit, or do humans build from scratch?
   Proactive Sunday-evening prompt ("time to plan next week?") — 
   welcome ritual or nag?
4. **Ambiguity & repair.** "buy milk" → oat or soy? Merge with existing
   list line or duplicate? When should the bot silently do the sensible
   thing vs. ask a one-tap clarifying question? (Error-repair cost is
   the make-or-break of chat UX.)
5. **Shopping in the store.** Check-off flow inside chat: an
   inline-keyboard checklist message the bot edits in place? Or is
   in-store check-off actually a Mini App / web moment?
6. **Proactivity budget.** Which notifications are wanted (tonight's
   dinner at 16:00, "list is ready" after locking) and what's the line
   before the bot becomes noise? Two-user household = every
   notification hits half the userbase.
7. **Tone.** Port the playful, emoji-heavy voice into Swedish/English
   chat messages; chat makes personality cheap and high-impact.

Method: competitive teardown (grocery/household bots on Telegram, e.g.
list-keeping bots, BringBot-alikes; plus non-Telegram references like
Bring!, AnyList's email/Siri capture); write **conversation scripts**
(sample dialogues) for the 6–8 core jobs and dry-run them with both
users on paper/Telegram before any code.

### B. Surface split — what stays on the web

Working hypothesis to pressure-test per surface:

| Job | Chat | Web / big screen | Mini App? |
| --- | --- | --- | --- |
| Add ad-hoc shopping item | ✅ primary | — | — |
| Lock next week's plan | ✅ primary (conversation + buttons) | fallback / power-edit | maybe (calendar grid) |
| "What's for dinner?" | ✅ | — | — |
| Check off while shopping | 🤔 contested | 🤔 | 🤔 strongest Mini App candidate |
| **Cook mode** (steps, scaled ingredients) | summary card only | ✅ primary — kitchen tablet/laptop | possible |
| Browse/rate/comment recipes | quick lookup | ✅ primary | possible |
| Admin: family members, curation, prices | — | ✅ only | — |

Research questions: which web surfaces survive as-is; whether Telegram
**Mini Apps** (web views inside chat, now with full-screen and
home-screen shortcuts) can replace the standalone site for the contested
rows — potentially reusing the existing React components — or whether
that's scope creep for a 2-person product. Decide: is the SPA retained,
shrunk to cook-mode + admin, or wrapped as a Mini App?

### C. Technical architecture

1. **Webhook host.** Leading candidate: **Supabase Edge Functions**
   (Deno) receiving Telegram webhooks — stays inside the Supabase
   boundary, has first-class examples with the **grammY** bot framework
   ([Supabase guide](https://supabase.com/docs/guides/functions/examples/telegram-bot),
   [grammY hosting guide](https://grammy.dev/hosting/supabase),
   [example repo](https://github.com/grammyjs/examples/blob/main/setups/supabase-edge-functions/supabase/functions/telegram-bot/index.ts)).
   Alternatives to evaluate honestly: Cloudflare Workers, Fly.io/VPS
   long-polling (simplest local dev), Vercel functions. Criteria: cold
   start, local dev loop, secrets handling, cost at 2-user scale
   (≈ free everywhere), harness testability.
2. **Bot framework.** grammY (TS, Deno-native, conversations plugin,
   sessions) vs. raw Bot API calls. grammY's conversations plugin maps
   well to the "lock the week" multi-turn flow.
3. **Language understanding.** Three tiers to compare:
   command/regex-only (`/buy milk`), rule-based shortcuts + **LLM
   fallback** (Claude Haiku-class parsing free text into typed intents
   against a tool/JSON schema), or LLM-first agent with tools. Research:
   latency, cost/msg, Swedish-language handling, failure modes,
   testability (can `./harness` replay a fixture conversation
   deterministically? → cache LLM calls content-addressed, per
   orchestration.spec.md lore).
4. **State & sessions.** Multi-turn planning conversation state: grammY
   sessions backed by a Supabase table vs. stateless
   (every message re-derives context from DB). Restartability bias says
   stateless-leaning.
5. **Recipe access at runtime.** Options: (a) build step publishes
   `recipes.json` to GitHub Pages, bot fetches + caches; (b) mirror
   recipes into a Supabase table on CI; (c) edge function reads raw
   GitHub. Keep markdown-in-repo as the source of truth (spec
   requirement) — research which mirror is least machinery.
6. **Identity & authorization.** Bot runs with service-role key ⇒ RLS
   is bypassed ⇒ the **edge function becomes the auth boundary**.
   Design: `telegram_accounts(telegram_user_id → household_member)`
   linking table; one-time deep-link (`/start <token>`) from the
   logged-in web app to bind Telegram id to Supabase user. Strict
   allow-list of the two household Telegram ids as a backstop; validate
   Telegram's webhook secret token.
7. **Harness extension.** What does `./harness check` gain: edge
   function typecheck/lint, unit tests for intent parsing (fixture
   messages → expected intents), a replayable conversation e2e against
   a mocked Bot API. Non-negotiable per the self-improvement rule.

### D. Data model evolution (all ask-first)

Sketch to refine during research:

- `households` + `household_members` (maps Supabase users in; family
  members likely fold into or reference this).
- Re-key `meal_plans` (and children) from user → household; migration
  path for existing rows.
- `shopping_list_items`: household-scoped; source = `recipe | adhoc`;
  normalized-ingredient link where derivable ("milk" → existing alias
  table — reuse `src/lib/ingredientNormalization`!); checked state;
  added-by; week association for recipe-derived rows.
- Plan **lock** state: `meal_plans.locked_at` — locking is the event
  that (re)generates the recipe-derived list rows and announces the
  shopping list in chat.
- `telegram_accounts` linking table (above).

Research question: how much of the pure logic in `src/lib/`
(normalization, scaling) can be shared verbatim with the Deno edge
function (it's dependency-light TypeScript — likely high reuse; this
would be the pivot's biggest code dividend).

### E. Telegram platform capabilities & constraints

Ground the design in the 2026 platform reality
([Bot API reference](https://core.telegram.org/bots/api),
[changelog](https://core.telegram.org/bots/api-changelog),
[Mini Apps](https://core.telegram.org/bots/webapps)): Bot API 9.5/9.6
era — Rich Messages (structured/streamed replies), Mini Apps with
full-screen + home-screen shortcuts, managed bots. Specifically verify:

- Inline keyboard limits & message-editing ergonomics for the
  check-off-list pattern (edit-in-place churn, rate limits).
- Group-chat privacy mode (bot sees only commands/mentions unless
  disabled — directly shapes the A.1 group-vs-DM decision).
- Scheduled/proactive sends (needs a cron: Supabase `pg_cron` +
  edge-function invoke).
- Voice notes → "buy milk" by voice (transcription pipeline — nice
  future, note cost).
- What Rich Messages actually enable for recipe cards.

### F. Ops, security, privacy, cost

Bot token + service-role key custody (Supabase secrets, never in repo —
existing 🚫 rule); webhook secret validation; the service-role/RLS
bypass reasoning written down; cost model at household scale (expected:
~0 SEK infra, low single-digit SEK/month LLM); what happens when
Telegram is down (web still works — an argument for extension over full
pivot); backup/export of the shopping list.

### G. Alternatives & prior art (timeboxed sanity check)

One honest pass before committing: WhatsApp Business API (where more
Swedish households live, but painful/paid API), Signal (no real bot
API), iMessage/Siri Shortcuts, native app + widgets. Expected
conclusion: Telegram's bot platform is uniquely good and the household
already uses it — but write the reasoning down.

## 4. Research execution plan

Sequenced spikes; each produces a short findings doc in
`docs/research/` and the batch feeds a human decision gate, after which
winners become P4 execplans.

| # | Spike | Deliverable | Depends on |
| --- | --- | --- | --- |
| R1 | Conversation design: script the 6–8 core dialogues; competitive teardown; dry-run with both users in a real Telegram group (humans role-playing the bot) | `r1-conversation-scripts.md` + verdicts on A.1–A.7 | — |
| R2 | Platform verification: build a **throwaway** echo-bot on Supabase Edge Functions + grammY; empirically test webhook loop, inline-keyboard editing, group privacy mode, local dev loop | `r2-platform-spike.md` + go/no-go on hosting choice | — |
| R3 | NLU bake-off: 30–50 fixture utterances (Swedish + English) → intent schema; compare rules-only vs rules+LLM on accuracy/latency/cost; define harness fixtures | `r3-nlu-bakeoff.md` | R1 (intents come from scripts) |
| R4 | Data model & identity design: household/shopping-list/linking schema + migration sketch + RLS/service-role security note | `r4-data-model.md` | R1 |
| R5 | Surface-split decision: web's remaining role, Mini App yes/no, cook-mode plan | `r5-surface-split.md` | R1, R2 |
| **Gate** | Human decision: pivot vs. extension; spec revisions (product.spec.md scope, AGENTS.md backend non-goal, design.spec.md chat voice); approve P4 phase | Updated specs + P4 execplans | R1–R5 |

Suggested first P4 slice after the gate (thinnest end-to-end value):
**"buy milk" only** — linked accounts, persisted shared list, ad-hoc
add + list view + check-off in chat. It exercises identity, schema,
webhook, and NLU in one small loop while the planner still lives on
the web; the plan-locking conversation lands second.

## 5. Success criteria for the research phase

- Both household users have read the R1 scripts and would *want* to use
  that bot daily.
- Hosting/runtime choice made from evidence produced by a running
  spike, not from docs alone.
- Every current-spec collision (section 2) has an explicit human
  decision recorded.
- The first P4 execplan is small enough to ship in one inner-loop
  session, and `./harness check` gains bot-side gates alongside it.

## Sources consulted

- [Supabase — Building a Telegram Bot on Edge Functions](https://supabase.com/docs/guides/functions/examples/telegram-bot)
- [grammY — Hosting on Supabase Edge Functions](https://grammy.dev/hosting/supabase)
- [grammY examples — Supabase edge function setup](https://github.com/grammyjs/examples/blob/main/setups/supabase-edge-functions/supabase/functions/telegram-bot/index.ts)
- [Telegram Bot API](https://core.telegram.org/bots/api) · [changelog](https://core.telegram.org/bots/api-changelog) · [Mini Apps](https://core.telegram.org/bots/webapps)
- [Telegram Bot API in 2026 — community overview](https://zeroclaws.io/blog/telegram-bot-api-2026-ai-agent-developers-guide/)
- [Merge — Telegram Mini Apps guide](https://merge.rocks/blog/how-to-build-a-telegram-mini-app-your-telegram-mini-apps-guide)
