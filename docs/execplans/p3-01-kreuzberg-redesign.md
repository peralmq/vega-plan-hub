---
id: p3-01-kreuzberg-redesign
title: Kreuzberg minimal redesign + dark/light mode
phase: P3
status: in-progress
depends_on: [p2-02-mock-auth-mode]
---

## Goal

Re-skin the app to the human-approved "Kreuzberg minimal" direction
(mockup A, chosen 2026-07-18 from three in-chat mockups): warm off-white
+ ink + one green, flat 1px borders, **no gradients**, emoji as the only
iconography, compassion copy accents — plus a working dark/light theme
toggle. Design contract updated accordingly (user-authorized).

## Non-goals

- No layout/IA changes: same screens, same flows, same components.
- No copy rewrite beyond the two approved accents (meta compassion note,
  footer motto).
- No touching `src/components/ui/*` internals (they re-skin via tokens).
- No new dependencies (next-themes is already installed).

## Context

The app's design system is CSS-custom-properties in `src/index.css`
(`:root` + `.dark` HSL triplets) exposed via a Tailwind 4 `@theme` block;
`@custom-variant dark (.dark *)` already exists, and a stale shadcn-blue
`.dark` block sits unused (nothing toggles the class). Gradients
(`bg-gradient-fun/warm/fresh/primary`) and playful shadows
(`shadow-glow/playful/fresh`) are used at ~30 call sites across the five
pages and feature components. `next-themes@0.4.6` is installed and
`ui/sonner.tsx` already consumes `useTheme()`. Approved palette (light /
dark): bg `#FAF7F0`/`#171714`, ink `#1A1A17`/`#F1EEE6`, card
`#FFFEF9`/`#1D1D19`, border `#E4DFD2`/`#2C2C27`, muted-fg
`#6B675C`/`#9B978A`, green `#3D7A4E`/`#7CB08A`.

## Progress

- [x] 2026-07-18 index.css: new light + dark token blocks; gradient/
      shadow/food tokens deleted from @theme and base
- [x] 2026-07-18 ThemeProvider wired in App.tsx; ThemeToggle component
- [x] 2026-07-18 toggle in all five page headers
- [x] 2026-07-18 all 26 gradient/shadow call sites restyled; grep clean
- [x] 2026-07-18 compassion copy accents (hero badge + CompassionFooter
      on CookMode/PlanMode/ShoppingSummary/Account)
- [x] 2026-07-18 design.spec.md + conventions.spec.md updated
- [x] 2026-07-18 gate + e2e green; screenshots (Cook dark+light, Plan
      light, Summary light+dark) shown to the human in-session
- [ ] human sign-off recorded; status → done

## Steps

1. Rewrite `src/index.css` token blocks (palette above as HSL triplets;
   radius 0.75rem; ring = green; secondary/muted/accent as tints of
   bg/ink, no new hues). Delete `--gradient-*`, `--shadow-fresh/glow/
   playful`, `--primary-glow`, food colors, and their `@theme` mappings.
2. Add ThemeProvider (`attribute="class"`, system default) and
   `src/components/ThemeToggle.tsx`; place in every page header.
3. Restyle call sites: primary CTAs → `bg-primary`, ink pills →
   `bg-foreground text-background`, cards → borders not shadows; day
   tiles per mockup (bordered, active = inverted ink).
4. Copy accents per the approved mockup.
5. Update design.spec.md (Voice/Visual identity) and conventions.spec.md
   (token quick-ref + dark-mode rule).
6. Verify (below); hand screenshots to the human; record verdict.

## Verification

- `./harness check` and `./harness e2e` green.
- `grep -rE "bg-gradient-(fun|warm|fresh|primary)|shadow-(glow|playful|fresh)" src/`
  → empty.
- Both modes render correctly on all four authed screens via
  `./harness dev-mock` (screenshots in Evidence).
- **Human visual sign-off recorded in Evidence before `done`.**

## Evidence

2026-07-18 implementation session.

```
$ grep -rEn "bg-gradient-(fun|warm|fresh|primary)|shadow-(glow|playful|fresh)|bg-(forest|citrus|carrot|berry|avocado)" src/
(no matches, exit 1)

$ ./harness check
check: deps ... OK (70 deps present)
check: npm run lint ... OK
check: npm test ... OK
check: npm run build ... OK
check: plans --validate ... plans validate: OK (11 plans)
check: validate-recipe ... validate-recipe: OK (27 recipes)
check: OK

$ ./harness e2e
  6 passed (5.1s)
```

Visual verification via `./harness dev-mock` + browser: Cook Mode
renders correctly in dark (system default) and light after toggling
the header pill; Plan Mode light shows ink meal tiles, dashed empty
slots, green stats and pill CTA; Shopping Summary light shows the
solid-green banner, dark shows the sage variant — all screenshots
presented to the human in-session. The e2e suite passed unmodified
(no assertion touched).

Functional-scrim exception exercised: the two `bg-gradient-to-*`
photo overlays (Landing hero fade, CookMode image scrim) were kept
per design.spec.md's scrim rule.
