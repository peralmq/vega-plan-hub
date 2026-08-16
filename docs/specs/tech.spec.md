# Tech Spec — Vega Plan Hub

Status: binding. Extracted 2026-07-17 from the shipped app (commit
`fe922eb`) as part of execplan `p1-01-spec-extraction`. What the system
*is*; the problem it solves is in [product.spec.md](product.spec.md),
code style in [conventions.spec.md](conventions.spec.md), gates in
[harness.spec.md](harness.spec.md).

## Commands

```
npm install        # .npmrc pins the public registry and legacy-peer-deps
                   # (react-day-picker@8 hard-peers date-fns 2/3 — see
                   # p2-01's Decision Log)
npm run dev        # Vite dev server
npm run build      # production build — also the de-facto type gate
npm run lint       # eslint (strict; grandfathered exceptions in eslint.config.js)
./harness check    # THE gate: deps, lint, unit tests, build, plan
                   # validation, recipe validation
./harness test     # Vitest unit suite standalone
./harness e2e      # hermetic Playwright suite (on-demand, not in check)
./harness plans    # backlog queries (--validate / --ready / --phase P)
./harness dev-mock # Vite dev server with VITE_MOCK_AUTH=true — browse the
                   # auth-gated views with no Google OAuth / Supabase network
                   # (docs/execplans/p2-02-mock-auth-mode.md)
```

## Stack

Vite 8 (Rolldown) · React 19 · TypeScript 5.9 (relaxed strictness:
`noImplicitAny` off; TS pinned <6 by typescript-eslint — see p2-01's
Decision Log) · React Router DOM 7 · TanStack Query 5 · shadcn-ui/Radix ·
Tailwind CSS 4 (CSS-first `@theme` in `src/index.css`; no
`tailwind.config.ts`) · Zod 4 · date-fns 4 · **Supabase JS 2** (auth +
Postgres) · Playwright (`@playwright/test` directly; the original
`lovable-agent-playwright-config` wrapper is unresolvable on the public
registry — see p1-03's Decision Log). Package manager: npm
(`package-lock.json`).

## Project structure

| Path | Role |
| --- | --- |
| `src/App.tsx` | Providers (QueryClient, Tooltip, Auth) + routes. Routes are auth-gated: `ProtectedRoute` redirects logged-out users to `/welcome`, `AuthRoute` redirects logged-in users away from it. |
| `src/pages/` | One component per route, default export: `Landing`, `CookMode`, `PlanMode`, `ShoppingSummary`, `Account`. |
| `src/components/` | Feature components (`account/`, `recipe/`) + `ui/` (shadcn primitives — never edited directly). |
| `src/contexts/AuthContext.tsx` | Supabase session state; `useAuth()` exposes `{ user, loading }`. |
| `src/hooks/` | Data hooks, all Supabase-backed except UI helpers: `useMealPlanDB` (weekly plans), `useFamilyMembers`, `useRecipeRatings`, `useRecipeComments`, plus `use-toast`, `use-mobile`. |
| `src/services/` | Static-method service classes: `recipeLoader` (markdown → `ParsedRecipe`), `mathemPriceService` (**mock** SEK price lookup with a 30-min in-memory cache — not a real integration). |
| `src/lib/` | Pure logic: `ingredientNormalization` (alias table → canonical names, aggregation), `ingredientScaling` (unit-group conversion, servings multiplier), `utils` (`cn()`). |
| `src/data/recipes/*.md` | The curated recipe library (18 recipes as of `p1-02-unit-test-suite`). Format below. |
| `src/data/ingredients/ingredients.json` | Ingredient reference data. |
| `src/integrations/supabase/` | Generated client + DB types. |

## Data model

**Client-side content** — recipes are markdown files bundled at build
time via `import.meta.glob('/src/data/recipes/*.md', { query: '?raw',
eager: true })`. The file format (frontmatter schema, ingredient-table
shape, required sections, field semantics) is defined in
[recipe-format.spec.md](recipe-format.spec.md) and enforced by
`./harness validate-recipe` (part of `./harness check` since
`p1-05-validate-recipe`, which also resolved the earlier README format
drift).

**Supabase (Postgres)** — per-user data, keyed by auth user:

| Table | Purpose |
| --- | --- |
| `meal_plans` | One row per user + `week_start` (Monday, `yyyy-MM-dd`). Only current and next week are fetched. |
| `daily_meals` | Child of `meal_plans`: `day_of_week` (0–6, Monday-start), `recipe_id` (references a markdown recipe id), `servings_multiplier`. |
| `family_members` | Household members for per-person tastes. |
| `recipe_ratings` | Ratings per family member per recipe. |
| `recipe_comments` | Comments per recipe. |

The join between DB and content happens client-side: `recipe_id` in
`daily_meals` is looked up against the loaded markdown recipes.

## Chat assistant (adopted 2026-07-31, gate-brief; ships in P4)

The product grows a Telegram assistant as the primary capture/planning
surface (docs/research/telegram-pivot-research-plan.md). Contract
points, binding for P4 work:

- **Schema**: the five tables in docs/research/r4-data-model-security.md
  §1 are approved (`telegram_accounts`, `planned_meals`, `plan_batches`,
  `shopping_list_items`, `product_preferences`); `planned_meals` +
  `plan_batches` replace `meal_plans` + `daily_meals` via the §2
  migration. `telegram_inbox` (raw-update queue for the hybrid
  transport, household-scoped RLS, allow-list-gated before enqueue)
  joined the approved set with the transport decision (gate-brief
  decision 2, 2026-08-14). Gate calls adopted: preference resolution at **add-time**;
  ad-hoc items batchless until shopping mode gathers them; per-person
  preference column kept but written null in v0.
- **Auth**: the bot authenticates as the (single, shared) household
  user with RLS active — the service-role key is not used. Senders are
  gated by the `telegram_accounts` allow-list; attribution stamps
  family members.
- **Transports**: **hybrid via queue** (decided 2026-08-14,
  gate-brief decision 2). The Supabase Edge Function webhook (grammY,
  secret-token validated) is the always-on capture layer: allow-list
  gate, then enqueue raw updates into `telegram_inbox`. The sandboxed
  agent runtime on household hardware (r6 runbook topology, r4 §5
  checklist) consumes the queue over an *outbound* Realtime
  subscription, runs the local NLU, and replies via outbound HTTPS.
  No inbound network path to the household machine — admin access is
  Tailscale-only (p4-07).
- **Language understanding**: rules first, LLM fallback; intents and
  fixtures in spikes/r3-nlu-bakeoff (graduates into `./harness` when
  the capture bot lands). Bot tools are narrow and enumerable — no
  shell, no browser, no arbitrary SQL.
- **Recipes**: markdown-in-repo stays the source of truth; the bot
  consumes them via shared loader logic or a build-time mirror.

## Store integrations (adopted 2026-08-16, p5-01 gate)

Grocery-store integrations are **outbound calls from the adopted M1
household host only** — never from the web app, never from edge
functions. Chains in scope: Mathem (official MCP, OAuth), Willys +
Hemköp (authenticated Axfood REST), Coop (anonymous API), ICA
(anonymous per-store search + **household login tier** — adopted by
Pelle 2026-08-16 in chat, reversing the same-day gate default; the
anonymous search leg stays the fallback whenever credentials are
absent). **Purchase-history seeding** is in scope per store: the
household's commonly-bought products (Mathem likely_to_buy, ICA
favorites/"Återkommande", Axfood purchase history) may be read to
pin real staples in the comparison — read-only, same credential
rules. Contract points:

- **Cart-ready, never checkout**: integrations may search, read
  delivery slots, and fill carts for human review in the store's own
  UI. Checkout, slot booking, and payment always stay with the
  human. This is a 🚫-never boundary.
- **Credentials** live only on the M1 in gitignored mode-600 files
  (`compare/.env`, `compare/.mathem-oauth.json` — bot/.env pattern);
  never in the repo, never echoed into evidence.
- **Be a polite client**: read-only by default, cached (12h), paced
  where a WAF asks for it; we never bypass bot-detection challenges.
- Deterministic logic (matching, basket assembly, fee/total
  computation) lives in fixture-tested code under `./harness check`;
  live network calls are evidence-only.

## Boundaries

- ✅ Always: `./harness check` before handoff; recipes as markdown files;
  pure logic in `src/lib/` (it is the unit-testable core); Supabase
  access only through hooks.
- ⚠️ Ask first: schema changes in Supabase beyond the approved P4 set
  above; new tables; replacing the mock price service with a real
  integration; touching auth flows.
- 🚫 Never: secrets in the repo (the Supabase publishable key in
  `client.ts` is public by design — anon key + RLS); editing
  `src/components/ui/*` in place; weakening a harness gate.

## Testing strategy (target — see execplans)

- **Unit (Vitest)**: `src/lib/` and the recipe loader parser — pure and
  high-value. Landed in `p1-02-unit-test-suite`; joins `./harness check`
  via `./harness test`.
- **E2E (Playwright)**: config already wired; tests go in `e2e/`. Core
  flows: welcome → (auth) → plan a week → shopping summary → cook mode.
  On-demand `./harness e2e`, not part of `check`.
- **Mock-auth mode** (`./harness dev-mock`): a dev-only, build-time-flagged
  (`VITE_MOCK_AUTH`) Supabase client double (`src/mocks/`) that gives a
  human browser access to the auth-gated views — Cook Mode, Plan Mode,
  Shopping Summary, Account — without a real account or network call. It is
  a manual-verification aid, not a test suite: the e2e suite's network-level
  mock (`e2e/support/mockDb.ts`) is the hermetic, automated check; this mode
  exists because that suite can't be eyeballed. Statically eliminated from
  production builds when the flag is unset (docs/execplans/p2-02-mock-auth-mode.md).
- Coverage grows with the maturity ladder in
  [harness.spec.md](harness.spec.md); backfilling 100% coverage is a
  non-goal.
