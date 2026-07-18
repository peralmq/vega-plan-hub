# Code & Design Conventions — Vega Plan Hub

Status: binding. Distilled 2026-07-17 from the pre-harness `AGENTS.md`
(and `.github/copilot-instructions.md`). This is the style contract for
all product code; the workflow contract lives in `AGENTS.md` and
[harness.spec.md](harness.spec.md).

Vega Plan Hub is a **fun, playful, emoji-filled vegan meal-planning
app**: vibrant colors, smooth animations, delightful copy. Every change
preserves that spirit.

## Architecture

- Vite + React 19 + TypeScript SPA with **Supabase** for auth and
  per-user persistence (meal plans, ratings, comments, family members);
  recipe content is markdown bundled at build time. Full architecture:
  [tech.spec.md](tech.spec.md).
- Pages in `src/pages/` (default export), components in
  `src/components/` (named export), business logic in `src/services/`
  (static-method classes) and pure logic in `src/lib/`, Supabase-backed
  state in `src/hooks/`, recipe content in `src/data/`.
- Supabase access goes through hooks (`useMealPlanDB`,
  `useFamilyMembers`, `useRecipeRatings`, `useRecipeComments`) — never
  raw `supabase.from()` calls in components.
- Routes are added in `src/App.tsx` **before** the catch-all `*` route.
- New UI primitives come from shadcn (`npx shadcn@latest add …`); never
  hand-roll what shadcn provides, never edit `src/components/ui/*`
  directly — extend instead.

## Code rules

- TypeScript interfaces for all props and data structures.
- Imports from src always use the `@/` alias, never relative paths.
- Class merging always goes through `cn()` (`@/lib/utils`).
- Business logic lives in services, not components.
- Stable keys in list renders (never array indices).
- Async effects clean up (cancelled flag / AbortController).
- Any localStorage access is wrapped in try-catch; primary persistence
  is Supabase via the hooks above.
- Expensive derived values and callbacks passed to children are memoized
  (`useMemo` / `useCallback`).

## Design system

"Kreuzberg minimal" (design.spec.md). Use semantic tokens from
`src/index.css` (`:root` + `.dark` blocks) — never arbitrary values
like `bg-[#hex]`.

- **Colors**: `background`/`foreground` (warm off-white/ink),
  `primary` (the one green), `secondary`/`muted`/`accent` (tints of
  bg/ink — no new hues), `destructive` (calm red). Every color must
  work in both modes; the `.dark` block is the counterpart of every
  `:root` token.
- **No gradients, no decorative shadows** — the old
  `bg-gradient-*`/`shadow-fresh/glow/playful` utilities are gone;
  structure comes from `border border-border` and surface tokens.
  Photo scrims (`bg-gradient-to-*` over an image) are the only
  exception.
- **Buttons**: primary CTA = `bg-primary text-primary-foreground
  rounded-full`; inverted emphasis = `bg-foreground text-background`.
- Hover states are subtle: color shifts (`hover:bg-muted`,
  `hover:border-primary`) or at most `hover:scale-[1.02]` — no bounces.
- **Dark/light**: `next-themes` ThemeProvider (`attribute="class"`) in
  `App.tsx`; the `ThemeToggle` (☀️/🌙 pill) belongs in every page
  header.

**Emojis are required in user-facing text.** House palette by category:
food 🥗🥕🥑🍅🥦, cooking 👨‍🍳🍳🥘🍽️, time ⏰⏱️, quality ✨⭐, actions
⚡💰🛒📝❤️💚, celebration 🎉🎊.

## Accessibility

shadcn components are accessible by default; keep it that way — semantic
HTML, `aria-label` on icon-only buttons, keyboard-reachable
interactions, visible focus, sufficient contrast.

## Swedish localization

Swedish market throughout: prices in SEK formatted `XX.XX kr`, metric
units only (kg, g, ml, l), common Swedish ingredient names where
relevant.

## Testing

Playwright is wired via `lovable-agent-playwright-config`
(`playwright.config.ts`); e2e tests go in `e2e/`. Unit tests, when they
arrive, use Vitest + React Testing Library: test user interactions, mock
localStorage, cover error paths. The harness gates are defined in
[harness.spec.md](harness.spec.md).
