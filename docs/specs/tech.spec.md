# Tech Spec — Vega Plan Hub

Status: binding. Extracted 2026-07-17 from the shipped app (commit
`fe922eb`) as part of execplan `p1-01-spec-extraction`. What the system
*is*; the problem it solves is in [product.spec.md](product.spec.md),
code style in [conventions.spec.md](conventions.spec.md), gates in
[harness.spec.md](harness.spec.md).

## Commands

```
npm install        # .npmrc pins the public registry and legacy-peer-deps
                   # (next-themes lacks a React 19 peer; p2-01 owns the fix)
npm run dev        # Vite dev server
npm run build      # production build — also the de-facto type gate
npm run lint       # eslint (strict; grandfathered exceptions in eslint.config.js)
./harness check    # THE gate: lint + build + execplan validation
./harness plans    # backlog queries (--validate / --ready / --phase P)
npx playwright test  # e2e (config present, no tests yet — see execplans)
```

## Stack

Vite 5 · React 19 · TypeScript 5.8 (relaxed strictness: `noImplicitAny`
off) · React Router DOM 7 · TanStack Query 5 · shadcn-ui/Radix ·
Tailwind CSS 3 · Zod 4 · date-fns 4 · **Supabase JS 2** (auth +
Postgres) · Playwright via `lovable-agent-playwright-config`. Package
manager: npm (a stale `bun.lockb` exists; `package-lock.json` is the
one npm uses).

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
| `src/data/recipes/*.md` | The curated recipe library (19 recipes). Format below. |
| `src/data/ingredients/ingredients.json` | Ingredient reference data. |
| `src/integrations/supabase/` | Generated client + DB types. |

## Data model

**Client-side content** — recipes are markdown files bundled at build
time via `import.meta.glob('/src/data/recipes/*.md', { query: '?raw',
eager: true })`. Frontmatter: `id` (unique, kebab-case, used in DB
references), `title`, `imageUrl`, `url`, `cookTime` (min), `servings`,
`difficulty` (`Easy|Medium|Hard`), `tags`. Body: `## Ingredients` as a
**markdown table** with columns `quantity | unit | key | ingredient |
notes`, then `## Instructions` (ordered list), optional `## Notes`.

> Known drift: `src/data/recipes/README.md` still documents an older
> list-based ingredient format with `[base]`/`[esoteric]` markers; the
> loader and all 19 recipe files use the table format. The planned
> `./harness validate-recipe` command should encode the table format
> and the README should be corrected when it lands.

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

## Boundaries

- ✅ Always: `./harness check` before handoff; recipes as markdown files;
  pure logic in `src/lib/` (it is the unit-testable core); Supabase
  access only through hooks.
- ⚠️ Ask first: schema changes in Supabase; new tables; replacing the
  mock price service with a real integration; touching auth flows.
- 🚫 Never: secrets in the repo (the Supabase publishable key in
  `client.ts` is public by design — anon key + RLS); editing
  `src/components/ui/*` in place; weakening a harness gate.

## Testing strategy (target — see execplans)

- **Unit (Vitest)**: `src/lib/` first — normalization, scaling, and the
  recipe loader parser are pure and high-value. Joins `./harness check`
  once it exists (`./harness test`).
- **E2E (Playwright)**: config already wired; tests go in `e2e/`. Core
  flows: welcome → (auth) → plan a week → shopping summary → cook mode.
  On-demand `./harness e2e`, not part of `check`.
- Coverage grows with the maturity ladder in
  [harness.spec.md](harness.spec.md); backfilling 100% coverage is a
  non-goal.
