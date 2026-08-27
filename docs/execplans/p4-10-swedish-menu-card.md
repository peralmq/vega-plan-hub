---
id: p4-10-swedish-menu-card
title: Veckans meny — a Swedish menu card with recipe photos sent after lock
phase: P4
status: todo
depends_on: [p4-03-planning-conversation]
---

## Goal

Locking a batch (and asking "visa menyn" / a `[📋 Meny]` button)
sends the household a beautiful Swedish menu: a `sendMediaGroup`
album of the batch's recipe photos (frontmatter `imageUrl`,
`placeholder.svg` fallback for empty ones) followed by an
HTML-formatted menu message — weekday emoji lines, bold titles,
⏰ cook time, the 🍱 meal-prep span called out ("räcker även till
onsdag"), quirky per-dish emojis, and the compassion footer in
Swedish. Inline buttons deep-link to the web app: `[📖 Recept]`,
`[🍳 Cook mode]`, `[🛒 Inköpslista]`, plus `[✏️ Byt en dag]` looping
back into the p4-03 edit flow.

## Non-goals

- No rendered-image menu in v1: a Playwright/chromium HTML→PNG card
  with the Kreuzberg design tokens is a recorded stretch (step 6),
  not the gate — it adds a browser runtime to the M1 host.
- No new recipe metadata: photos come from existing `imageUrl`
  frontmatter; dish emojis from a small tag→emoji map with a 🌱
  fallback.
- No per-member menus or dietary variants.

## Context

Product spirit: emojis and playfulness are requirements, not
decoration (conventions.spec, AGENTS.md non-goals). Script 4/5 in
r1-conversation-scripts.md set the voice — Swedish household-facing
copy, the compassion footer ("cooked with compassion · för djuren,
planeten & varandra 🐾🌍💚"). Telegram: `sendMediaGroup` takes up to
10 photos by URL (external `imageUrl`s work — Telegram fetches them);
captions are per-photo, and the menu text goes in its own message so
formatting is never at the mercy of album caption rules. Menu text is
built by a pure, deterministic builder over the locked batch so it
snapshot-tests cleanly.

Template (the contract for the builder; days/dishes illustrative):

    🌱✨ VECKANS MENY ✨🌱
    ons 27/8 – sön 31/8

    ons 🍲 **Mapo Tofu** ⏰ 20 min 🌶
    tor 🍛 **Chana Dal** ⏰ 35 min · 🍱 meal prep ×2
    fre 🍛 *Chana Dal — redan lagad!* 🍱😌
    lör 🌮 **Fredagsmys-tacos** (på en lördag 😜) ⏰ 25 min
    sön 🍝 **Baked Feta Pasta** ⏰ 30 min

    🛒 19 varor · ~487 kr
    cooked with compassion · för djuren, planeten & varandra 🐾🌍💚

## Progress

- [ ] Pure menu builder (batch → media group spec + HTML text),
      snapshot-tested incl. meal-prep span, empty imageUrl, >10 photos
- [ ] Tag→emoji map with 🌱 fallback, unit-tested
- [ ] Bot wiring: post-lock send + `[📋 Meny]` / "visa menyn" intent
- [ ] Deep-link buttons verified against the deployed web app routes
- [ ] Live: household receives the menu for a real locked batch

## Steps

1. Menu builder as pure logic beside the p4-03 state machine: input
   locked batch + recipes, output `{album: [...], html: "..."}`.
   Swedish weekday/date formatting; meal-prep continuation days
   render as the italic "redan lagad" line, never a duplicate entry.
2. Tag→emoji map (Dal/Curry 🍛, Tacos 🌮, Pasta 🍝, Soup 🍲, …) with
   🌱 fallback; property test: every shipped recipe gets an emoji.
3. Bot wiring: send album then menu message after lock confirmation;
   register the menu intent/button; re-sending is idempotent (a new
   request re-renders from DB state, per the stateless bias).
4. Buttons: recipe/cook-mode/shopping deep links from the deployed
   Pages URL config; `[✏️ Byt en dag]` re-enters the p4-03 edit flow.
5. Mocked Bot API test: album order matches menu order; >10 photos
   truncates the album (never the text menu).
6. (Stretch, separate handoff) Rendered PNG card via Playwright with
   design tokens — only if the M1 host budget allows; record the
   decision either way.

## Verification

- `./harness check` passes; builder snapshots cover the 5-day
  meal-prep batch, a 3-day batch, and missing-image fallback.
- Fixture replay: lock in the mocked p4-03 flow ends with album +
  menu message in order.
- Live: the household receives and (informally) approves the menu for
  the first real locked batch — screenshot recorded in Evidence.

## Evidence

(recorded during implementation)
