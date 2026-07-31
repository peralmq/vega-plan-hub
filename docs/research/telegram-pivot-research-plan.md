# Research Plan — Telegram-First Conversational Pivot

Status: draft research plan, 2026-07-31 (rev 2 same day: shared-account
decision, preference learning, self-hosted OpenClaw track). Not binding. This document
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
| Data is **per-user** — `meal_plans` etc. are keyed by the Supabase auth user ([tech.spec.md](../specs/tech.spec.md)) | **Resolved 2026-07-31:** the household shares one Gmail, hence one Supabase user — shared state is already free. No re-keying migration needed. What remains is **attribution**: knowing *which partner* sent "buy milk" (Telegram id → `family_members` mapping), for per-person tastes and "who added this". |
| The shopping list is **derived, never persisted** — aggregated client-side from the week's recipes | "buy milk" (an ad-hoc item) has nowhere to live. Needs a persisted `shopping_list_items` table with both recipe-derived and ad-hoc rows, plus check-off state. |
| "milk" is one canonical ingredient in the alias table | **Directive 2026-07-31:** "milk" must resolve to the *currently preferred product* (a particular oat milk, say), and preferences drift over time. Needs a **preference-learning layer** on top of normalization — see dimension A.8 and the data-model sketch. |
| Recipes are **markdown bundled into the SPA at build time** (`import.meta.glob`) | **Directive 2026-07-31:** either materialize recipes at build time (published JSON artifact / DB mirror) or share the loader logic across interfaces — both keep markdown-in-repo as source of truth; research picks the least machinery. |
| Auth is Supabase Google OAuth; identity = Google account | Simplified by the shared account: a strict **allow-list of the two household Telegram ids**, each mapped to a `family_members` row, all acting as the one Supabase user. No general linking flow needed. |
| Non-goal in AGENTS.md: "No new backend surface beyond Supabase" | A bot webhook **is** a new backend surface — and the self-hosted OpenClaw track (C, Track B) is a home server, further outside the boundary still. Both are spec changes a human must sign off. |
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
8. **Preference learning & adaptivity** (user directive 2026-07-31: the
   assistant should be "a bit smart and adaptive with memory as we chat
   with it"). "milk" must resolve to the *currently preferred product*
   (a specific oat milk today, maybe a different one next month).
   Research questions: how are preferences learned — explicitly ("we
   switched to Ikaffe"), by correction (bot adds X, human edits to Y),
   or by observation (what actually gets checked off)? How does a
   preference *expire or flip* without the bot nagging? Per-person or
   per-household preferences? And crucially the **trust boundary**:
   learned preferences should become *inspectable structured facts*
   (rows you can see and edit, e.g. on the web admin) — not opaque
   vector memory — so the shopping list stays trustworthy. Agent
   memory (Track B below) is the *extraction mechanism*, not the store
   of record.

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

### C. Technical architecture — two tracks to compare

User directives (2026-07-31): explore a **self-hosted agent runtime
with a non-frontier local LLM** ("openclaw or a derivative — or maybe
something better"), it must be **sandboxed** ("security is important"),
and it must be **smart and adaptive with memory as we chat**. That
makes this a two-track comparison, decided by evidence from spikes, not
by taste:

**Track A — thin custom bot (cloud, minimal surface).** Supabase Edge
Functions (Deno) receive Telegram webhooks via the **grammY** framework
([Supabase guide](https://supabase.com/docs/guides/functions/examples/telegram-bot),
[grammY hosting guide](https://grammy.dev/hosting/supabase)); language
understanding via rules + a small hosted-LLM fallback parsing free text
into typed intents. Stays closest to the existing Supabase boundary;
smallest attack surface; but "memory/adaptivity" is only whatever we
explicitly build.

**Track B — self-hosted agent runtime + local LLM (home hardware).**
An agent gateway runs at home, bridges Telegram, holds conversational
memory, and calls Vega Plan Hub operations as tools against Supabase.
The LLM is a local non-frontier model (Ollama/vLLM/LM Studio; e.g.
Qwen3 / Llama 3.x / Gemma-class). Candidates to evaluate — **runtime
choice is an open research question, not settled on OpenClaw**:

| Candidate | For | Against / verify |
| --- | --- | --- |
| **OpenClaw** ([openclaw.ai](https://openclaw.ai/), [Ollama integration](https://docs.ollama.com/integrations/openclaw)) | Turnkey Telegram channel, persistent memory, skills system, documented [Docker sandboxing](https://docs.openclaw.ai/gateway/sandboxing) (default `network: "none"`, `capDrop: ALL`, read-only root) | Serious track record: [138+ CVEs, ~135K exposed instances, ~900 malicious ClawHub skills reported by May 2026](https://www.vellum.ai/blog/best-openclaw-alternatives); broad credential access by design; heavyweight for a 2-person tool |
| **Letta (MemGPT)** ([self-host on Postgres + pgvector](https://railway.com/deploy/letta-ai-agent)) | Memory is the *core competency* — self-editing core/recall/archival memory tiers; model-agnostic incl. local; clean REST API | No native Telegram — needs a thin bridge bot; agent server is another stateful service to run |
| **Security-focused lightweight runtimes** (NanoClaw, ZeroClaw, Nanobot — [survey](https://composio.dev/content/openclaw-alternatives)) | Small auditable surface, constrained by design | Younger, fewer batteries; memory story varies — verify per candidate |
| **Custom thin agent** — grammY bridge + Ollama + memory in **Supabase pgvector** | Least attack surface; memory lives in the DB we already trust and can inspect; fully ours | We build the agent loop + memory management ourselves; most engineering |

Cross-cutting research questions for Track B:

1. **Local-model competence.** Can a non-frontier model reliably do
   tool-calling / constrained-JSON intent extraction in *Swedish*
   ("köp havremjölk", "byt torsdag till tacos")? Which is the smallest
   adequate model, and what does it need in RAM/VRAM on hardware we
   actually own? (OpenClaw docs suggest ≥64k context for local models —
   sizing matters.)
2. **Memory architecture.** Whatever the runtime, learned facts that
   affect shopping (A.8) must land as structured rows in Supabase;
   conversational/episodic memory (what we discussed, running jokes,
   soft context) can live in the runtime's memory layer or pgvector.
   Research where that line sits per candidate.
3. **Sandboxing & exposure** (hard requirement). Baseline regardless of
   candidate: runs in a container/VM with no inbound exposure — the
   *only* ingress is the runtime's outbound connection to Telegram
   (long-polling preferred: zero open ports); dashboard/admin never on
   the public internet (LAN/Tailscale only); default-deny egress
   allow-list (Telegram API + Supabase only); no third-party
   skill/plugin marketplaces; secrets outside the repo. Docker's own
   [OpenClaw sandbox guidance](https://www.docker.com/blog/run-openclaw-securely-in-docker-sandboxes/)
   and the [hardening guides](https://insiderllm.com/guides/openclaw-security-guide/)
   define the checklist to adapt.
4. **Prompt injection.** The bot reads free text from a chat and holds
   DB-write tools. Scope tools narrowly (add/remove list item, set
   plan day, record preference — no shell, no browser, no arbitrary
   SQL), confirm destructive actions in chat, treat recipe/comment text
   as untrusted.
5. **Operational reality.** Home server = the bot is down when the box
   is down; who patches it; backup story. Weigh honestly against
   Track A's ~zero ops. A hybrid is explicitly on the table: Track A
   for the always-on capture path ("buy milk" must never fail) +
   Track B for the smart conversational layer.

Shared questions (both tracks):

6. **State & sessions.** Multi-turn planning conversation state:
   runtime sessions vs. stateless re-derivation from DB.
   Restartability bias says stateless-leaning for anything that
   matters.
7. **Recipe access at runtime.** Options: (a) build step publishes
   `recipes.json` to GitHub Pages, bot fetches + caches; (b) mirror
   recipes into a Supabase table on CI; (c) share `recipeLoader` logic
   across interfaces (user directive: either materializing or shared
   logic is acceptable). Markdown-in-repo stays the source of truth.
8. **Identity & authorization.** Bot runs with service-role key ⇒ RLS
   bypassed ⇒ the bot process is the auth boundary. Shared account
   simplifies this to: strict allow-list of the two household Telegram
   ids, each mapped to a `family_members` row for attribution; validate
   Telegram's webhook secret (Track A) / rely on polling auth (Track B).
9. **Harness extension.** What `./harness check` gains: bot code
   typecheck/lint, unit tests for intent parsing (fixture utterances →
   expected intents, LLM calls cached content-addressed per
   orchestration.spec.md lore), a replayable conversation e2e against a
   mocked Bot API. Non-negotiable per the self-improvement rule.

### D. Data model evolution (all ask-first)

Sketch to refine during research (simplified by the shared-account
decision — no household re-keying, no migration of existing rows):

- `telegram_accounts(telegram_user_id → family_member_id)` — the
  allow-list *and* the attribution mechanism ("who said buy milk").
- `shopping_list_items`: source = `recipe | adhoc`;
  normalized-ingredient link where derivable ("milk" → existing alias
  table — reuse `src/lib/ingredientNormalization`!); checked state;
  `added_by` family member; week association for recipe-derived rows.
- `product_preferences`: canonical ingredient → currently preferred
  product/variant ("mjölk" → "Oatly Havredryck Deluxe"), effective-dated
  (`valid_from`, superseded-by) so preferences can drift over time and
  history is auditable; `source` = explicit | correction | observed;
  optional per-family-member override. **This table — not agent
  memory — is the store of record for what lands on the list** (A.8).
- Agent/episodic memory (Track B): candidate-runtime-native store or a
  pgvector table in Supabase; research which, and what its retention
  policy is. Structured facts always get promoted out of it into real
  tables.
- Plan **lock** state: `meal_plans.locked_at` — locking is the event
  that (re)generates the recipe-derived list rows and announces the
  shopping list in chat.

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

Security is a **hard requirement** (user directive 2026-07-31), and the
self-hosted-agent ecosystem's track record demands respect: Shodan
scans found tens of thousands of exposed OpenClaw instances with auth
bypasses in early 2026, and its skills marketplace shipped malicious
packages. The research must produce a written **threat model** and a
deployment checklist before any Track B runtime touches real data:

- Container/VM isolation with default-deny egress; long-polling ingress
  (zero open ports); admin UI on LAN/Tailscale only, never public.
- No third-party skill/plugin installs; every tool the agent holds is
  ours, narrow, and enumerable.
- Bot token + service-role key custody (secrets manager / env, never in
  repo — existing 🚫 rule); the service-role/RLS-bypass reasoning
  written down; webhook secret validation on Track A.
- Prompt-injection posture: narrow tools, chat confirmation for
  destructive actions, recipe/comment text treated as untrusted input.
- Patch cadence and CVE watch for whichever runtime wins; prefer the
  smallest auditable surface that meets the memory requirement.

Ops & cost: home-server uptime vs. Track A's ~zero ops (hybrid option
noted in C.5); cost model at household scale (expected: ~0 SEK infra on
Track A, electricity + hardware on Track B, low single-digit SEK/month
if any hosted LLM is used); what happens when Telegram is down (web
still works — an argument for extension over full pivot);
backup/export of the shopping list and preference history.

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
| R1 | Conversation design: script the 6–8 core dialogues **including preference-teaching moments** ("we switched milk"); competitive teardown; dry-run with both users in a real Telegram group (humans role-playing the bot) | `r1-conversation-scripts.md` + verdicts on A.1–A.8 | — |
| R2 | Track A spike: **throwaway** echo-bot on Supabase Edge Functions + grammY; empirically test webhook loop, inline-keyboard editing, group privacy mode, local dev loop | `r2-track-a-spike.md` | — |
| R3 | Runtime + model bake-off (Track B): shortlist runtimes (OpenClaw vs Letta vs lightweight vs custom) on the memory + sandbox criteria; run 30–50 fixture utterances (Swedish + English) through 2–3 local models (and one hosted baseline) for intent accuracy/latency on our hardware | `r3-runtime-model-bakeoff.md` | R1 (intents come from scripts) |
| R4 | Data model & security design: shopping-list/preferences/attribution schema; threat model + sandbox deployment checklist; RLS/service-role note | `r4-data-model-security.md` | R1 |
| R5 | Surface-split decision: web's remaining role, Mini App yes/no, cook-mode plan | `r5-surface-split.md` | R1, R2 |
| R6 | Track B spike: winning runtime from R3 deployed **sandboxed** (no inbound ports, egress allow-list, LAN-only admin) with a local model and exactly one tool — "add item to shopping list" writing to Supabase; live with both users for a week | `r6-track-b-spike.md` | R3, R4 |
| **Gate** | Human decision: pivot vs. extension; Track A vs B vs hybrid; spec revisions (product.spec.md scope, AGENTS.md backend non-goal, design.spec.md chat voice); approve P4 phase | Updated specs + P4 execplans | R1–R6 |

Suggested first P4 slice after the gate (thinnest end-to-end value):
**"buy milk" only** — allow-listed Telegram ids, persisted shared
list, ad-hoc add + list view + check-off in chat, preferences applied
from the `product_preferences` table. It exercises attribution,
schema, transport, and NLU in one small loop while the planner still
lives on the web; the plan-locking conversation lands second, and
preference *learning* (vs. manually seeded preferences) third.

## 5. Success criteria for the research phase

- Both household users have read the R1 scripts and would *want* to use
  that bot daily.
- Hosting/runtime choice made from evidence produced by a running
  spike, not from docs alone — and no Track B runtime is eligible
  unless it passes the R4 sandbox checklist as deployed (verified: no
  inbound ports, egress allow-list, admin unreachable from WAN).
- The preference layer is demonstrated round-trip in R6: teach it
  "we buy X now" in chat, see the structured row change, see the next
  "buy milk" resolve to X.
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
- [OpenClaw](https://openclaw.ai/) · [sandboxing docs](https://docs.openclaw.ai/gateway/sandboxing) · [Ollama integration](https://docs.ollama.com/integrations/openclaw) · [Docker's hardening guide](https://www.docker.com/blog/run-openclaw-securely-in-docker-sandboxes/) · [InsiderLLM security guide](https://insiderllm.com/guides/openclaw-security-guide/)
- OpenClaw risk record & alternatives: [Vellum comparison (CVE/exposure stats)](https://www.vellum.ai/blog/best-openclaw-alternatives) · [Composio survey](https://composio.dev/content/openclaw-alternatives) · [DEV — security lessons running a local agent](https://dev.to/andremmfaria/when-chat-turns-into-control-security-lessons-from-running-a-local-ai-agent-21l0)
- [Letta (MemGPT) self-host template — Postgres + pgvector](https://railway.com/deploy/letta-ai-agent) · [memory-tier walkthrough](https://sureprompts.com/blog/letta-memgpt-walkthrough)
