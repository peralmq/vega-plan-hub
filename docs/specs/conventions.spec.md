# Code & Design Conventions — Vega Plan Hub

Status: binding. Distilled 2026-07-17 from the pre-harness `AGENTS.md`
(and `.github/copilot-instructions.md`). This is the style contract for
all product code; the workflow contract lives in `AGENTS.md` and
[harness.spec.md](harness.spec.md).

Vega Plan Hub is a **fun, playful, emoji-filled vegan meal-planning
app**: vibrant colors, smooth animations, delightful copy. Every change
preserves that spirit.

## Architecture

- Client-side only: Vite + React 19 + TypeScript, React Router DOM,
  TanStack Query, shadcn-ui (Radix), Tailwind. **No backend, no auth** —
  persistence is localStorage (see `useMealPlans`).
- Pages in `src/pages/` (default export), components in
  `src/components/` (named export), business logic in `src/services/`
  (static-method classes), shared state hooks in `src/hooks/`, recipe
  content in `src/data/`.
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
- localStorage access is always wrapped in try-catch; state and storage
  are written together.
- Expensive derived values and callbacks passed to children are memoized
  (`useMemo` / `useCallback`).

## Design system

Use semantic tokens from `src/index.css` / `tailwind.config.ts` — never
arbitrary values like `bg-[#hex]`.

- **Colors**: `primary` (purple), `secondary` (soft yellow), `accent`
  (orange), `destructive`, plus `forest`, `citrus`, `carrot`, `berry`,
  `avocado`.
- **Gradients**: `bg-gradient-primary`, `bg-gradient-fresh`,
  `bg-gradient-warm`, `bg-gradient-fun`.
- **Shadows**: `shadow-fresh`, `shadow-glow`, `shadow-playful`.
- Hover states animate: `hover:scale-105`, `hover:-translate-y-2`,
  `transition-all`.

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
