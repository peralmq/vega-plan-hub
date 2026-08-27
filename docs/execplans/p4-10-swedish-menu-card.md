---
id: p4-10-swedish-menu-card
title: Veckans meny — a Swedish menu card with recipe photos sent after lock
phase: P4
status: todo
depends_on: [p4-03-planning-conversation, p4-11-cookmode-deep-links]
---

## Goal

Locking a batch (and asking "visa menyn" / a `[📋 Meny]` button)
sends the household a beautiful Swedish menu: a `sendMediaGroup`
album of the batch's recipe photos (frontmatter `imageUrl`,
`placeholder.svg` fallback for empty ones) followed by an
HTML-formatted menu message — the batch's meal *pool* as a list
(design.spec "Pool over calendar": no weekday lines), bold titles,
⏰ cook time, the 🍱 ×2 meal-prep badge, quirky per-dish emojis, and
the compassion footer in Swedish. **Every dish title is a link** into that meal's Cook Mode —
`https://peralmq.github.io/vega-plan-hub/?recipe=<id>&scale=<multiplier>`
(contract: p4-11) — in both deliverables: the chat menu message
(HTML `<a>` per line) and the **menu PDF** (directive Pelle
2026-08-27), a design-token-styled card rendered via Playwright
`page.pdf()` — which preserves clickable link annotations, unlike a
PNG — and sent with `sendDocument`. Inline buttons on the chat
message: `[📖 Recept]`, `[🛒 Inköpslista]`, plus `[✏️ Byt en dag]`
looping back into the p4-03 edit flow.

## Non-goals

- No PNG/image render of the menu: the rendered deliverable is the
  PDF precisely because PDF keeps per-meal links clickable.
- No new recipe metadata: photos come from existing `imageUrl`
  frontmatter; dish emojis from a small tag→emoji map with a 🌱
  fallback.
- No per-member menus or dietary variants.
- No public/unauthenticated recipe pages: links land on the
  auth-gated app; the login round-trip is p4-11's contract.

## Context

Product spirit: emojis and playfulness are requirements, not
decoration (conventions.spec, AGENTS.md non-goals). Script 4/5 in
r1-conversation-scripts.md set the voice — Swedish household-facing
copy, the compassion footer ("cooked with compassion · för djuren,
planeten & varandra 🐾🌍💚"). Telegram: `sendMediaGroup` takes up to
10 photos by URL (external `imageUrl`s work — Telegram fetches them);
captions are per-photo, and the menu text goes in its own message so
formatting is never at the mercy of album caption rules. Menu text,
link URLs and the PDF's HTML are built by one pure, deterministic
builder over the locked batch so they snapshot-test cleanly; the
Playwright render step consumes the builder's HTML unchanged.
Playwright is already a dev dependency, but the PDF render adds a
chromium install to the M1 host — record it in the r6 runbook
prerequisites alongside the p4-08 ones. The 🍱 ×2 meal-prep entry
renders once with its badge and one recipe link — never as two list
lines.

Template (the contract for the builder; dishes illustrative — a meal
list with counts, per the pool model, not a day-by-day schedule):

    🌱✨ VECKANS MENY ✨🌱
    5 dagar · 27/8–31/8 · 5 middagar

    🍲 **Mapo Tofu** ⏰ 20 min 🌶
    🍛 **Chana Dal** ⏰ 35 min · 🍱 meal prep ×2
    🌮 **Fredagsmys-tacos** ⏰ 25 min
    🍝 **Baked Feta Pasta** ⏰ 30 min

    Ni väljer kvällens rätt när ni vill 😌
    🛒 19 varor · ~487 kr
    cooked with compassion · för djuren, planeten & varandra 🐾🌍💚

~~Inherited (p4-03 residual, 2026-08-27): extend vitest include to
`bot/**` and commit the adapter smoke~~ — **discharged same day** by
the p4-03 live-triage commit (`4f36921`): vitest now includes
`bot/**/*.test.ts`, and `bot/tools.test.ts` + `bot/fakeSupabase.ts`
(strict postgrest double) are committed. New bot-side menu code in
this plan simply lands with tests in that suite.

## Progress

- [ ] Pure menu builder (batch → media group spec + chat HTML + PDF
      HTML, per-meal p4-11 deep links), snapshot-tested incl. the
      🍱 ×2 collapse, empty imageUrl, >10 photos
- [ ] Tag→emoji map with 🌱 fallback, unit-tested
- [ ] Menu PDF: Playwright `page.pdf()` with design tokens, links
      verified clickable; chromium prerequisite recorded in r6 runbook
- [ ] Bot wiring: post-lock album + menu message + PDF document,
      `[📋 Meny]` / "visa menyn" intent
- [ ] Deep links verified against the deployed Pages app
- [ ] Live: household receives menu + PDF for a real locked batch

## Steps

1. Menu builder as pure logic beside the p4-03 state machine: input
   locked batch + recipes + base URL, output
   `{album: [...], chatHtml: "...", pdfHtml: "..."}` with every dish
   title wrapping its `?recipe=<id>&scale=<multiplier>` link. Swedish
   date-range formatting; pool entries collapse by recipe (🍱 ×2
   badge), never duplicate lines; album has one photo per distinct
   dish.
2. Tag→emoji map (Dal/Curry 🍛, Tacos 🌮, Pasta 🍝, Soup 🍲, …) with
   🌱 fallback; property test: every shipped recipe gets an emoji.
3. PDF render: Playwright `page.pdf()` over the builder's `pdfHtml`
   (design tokens, recipe photos, A4-ish card); assert link
   annotations exist in the output PDF in a unit-level test.
4. Bot wiring: send album, menu message, then the PDF via
   `sendDocument` after lock confirmation; register the menu
   intent/button; re-sending is idempotent (a new request re-renders
   from DB state, per the stateless bias).
5. Buttons: shopping/recipe links from the deployed Pages URL config;
   `[✏️ Byt en dag]` re-enters the p4-03 edit flow.
6. Mocked Bot API test: album order matches menu order; >10 photos
   truncates the album (never the text menu or PDF); r6 runbook gains
   the chromium prerequisite.

## Verification

- `./harness check` passes; builder snapshots cover the 5-day
  meal-prep batch, a 3-day batch, and missing-image fallback.
- Fixture replay: lock in the mocked p4-03 flow ends with album +
  menu message in order.
- Live: the household receives and (informally) approves the menu for
  the first real locked batch — screenshot recorded in Evidence.

## Evidence

(recorded during implementation)
