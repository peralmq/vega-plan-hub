---
id: p4-10-swedish-menu-card
title: Veckans meny — a Swedish menu card with recipe photos sent after lock
phase: P4
status: in-progress
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

- [x] (2026-08-27) Pure menu builder (batch → media group spec + chat HTML
      + PDF HTML, per-meal p4-11 deep links), snapshot-tested incl. the
      🍱 ×2 collapse, empty imageUrl, >10 photos
- [x] (2026-08-27) Tag→emoji map with 🌱 fallback, unit-tested
- [x] (2026-08-27) Menu PDF: Playwright `page.pdf()` with design tokens,
      links verified clickable; chromium prerequisite recorded in r6 runbook
- [x] (2026-08-27) Bot wiring: post-lock album + menu message + PDF
      document, `[📋 Meny]` / "visa menyn" intent
- [ ] Deep links verified against the deployed Pages app — **partially
      checked**: `?recipe=mapo-tofu&scale=2` against the live
      `https://peralmq.github.io/vega-plan-hub/` round-trips correctly to
      `/welcome?recipe=mapo-tofu&scale=2` (Evidence), confirming the exact
      param format this plan's links use survives the auth redirect per
      p4-11's contract. Left unticked because the full "opens the dish,
      scaled" behavior needs a logged-in session, which this implementer
      session has no credentials for (same boundary p4-11 itself hit).
- [ ] Live: household receives menu + PDF for a real locked batch —
      **human-only**, not done in this session; status stays `in-progress`.

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

### Files added

- `src/lib/menuCard.ts` — the pure builder (`buildMenuCard`):
  `{ album, chatHtml, pdfHtml }` from a locked batch's pool + the recipe
  corpus. Reuses `planConversation.ts`'s `poolLines` for the 🍱 ×N
  collapse (so the draft, the lock announcement, and this card can never
  disagree about the pool), its own `MENU_TAG_EMOJI` table with a 🌱
  fallback (deliberately not `planConversation.dishEmoji`, whose 🥘
  fallback also doubles as a real mapped emoji there), `menuDishUrl`
  (always emits both `recipe` and `scale`, unlike `cookModeUrl`'s
  omit-at-1× behavior), and local-image→absolute-Pages-URL resolution
  with a `/placeholder.svg` fallback for a blank `imageUrl`.
- `src/lib/menuCard.test.ts` (+ `__snapshots__/menuCard.test.ts.snap`) —
  19 tests: chat/PDF HTML snapshots for a 5-day meal-prep batch and a
  3-day no-prep batch; the 🍱 ×2 collapse (one line, one badge); every
  dish title's `?recipe=&scale=` link; the shopping line, the compare
  handoff (full batch id — chatHtml only, not pdfHtml), and the Swedish
  compassion footer; missing-`imageUrl` → placeholder; >10 distinct
  dishes truncates the album but never the text/PDF; `menuDishUrl`
  param encoding; `menuDishEmoji` as a property test over the REAL
  shipped corpus (every recipe gets a non-empty emoji; a Dal-tagged one
  gets 🍛, not the fallback; an untagged one gets 🌱).
- `bot/menuPdf.ts` — `renderMenuPdf(html)`: Playwright `chromium.launch()`
  → `setContent` → `page.pdf({ format: "A4", printBackground: true })`.
- `bot/menuPdf.test.ts` — real chromium render (no injection): asserts
  the output starts with the `%PDF-` magic bytes, and that the `<a
  href>` survives as a clickable link annotation — searched for `/URI`
  both in the raw PDF bytes AND in every zlib-inflated stream (modern
  Chromium PDF output can put `/Annots` inside a compressed object
  stream, so a naive raw-bytes grep alone would have been a false
  negative).
- `bot/menu.ts` — the Telegram/Playwright adapter: `resolveMenuTarget`
  (current batch, else the most-recently-locked one — same fallback
  shape as `show_list`, and what makes the immediate post-lock send work
  even when an earlier batch still covers today) and `sendMenuCard`
  (album → HTML menu message → PDF document, in that order; PDF
  renderer injected for fast tests, defaulting to the real one).
- `bot/menu.test.ts` — 6 tests: `resolveMenuTarget`'s two fallback paths
  + the "nothing locked" case; `sendMenuCard`'s call order and album/menu
  agreement (over the real recipe corpus via `loadRecipeLibrary`); >10
  distinct dishes truncates the album only; an empty pool skips
  `sendMediaGroup` entirely (no 0-photo call).

### Files changed

- `bot/telegram.ts` — `sendMessage` gained an optional 4th `parseMode`
  param (`"HTML"`, opt-in; every existing caller is unaffected); new
  `sendMediaGroup` (photo album) and `sendDocument` (multipart upload —
  the one outbound call needing a non-JSON body, so it doesn't go
  through the shared `call()` helper).
- `src/lib/planConversation.ts` — `PlanStore` gained
  `loadBatchEntries(batchId)` (pool entries for an ARBITRARY batch, not
  just the one covering today — needed by the menu card's replay and by
  the immediate post-lock send). The `"lock"` case now captures
  `lockBatch`'s returned id, appends the p5-05-deferred compare-handoff
  line (`💻 Prisjämför: npm run compare -- --batch <full id>`), and adds
  a `[📋 Meny]` button (`callback_data: "show_menu"`, deliberately
  outside the `"p:"` vocabulary — the pure state machine has no
  Telegram album/document port, so this is routed as a plain callback in
  `bot/tools.ts` instead of through `handlePlanEvent`).
- `bot/planning.ts` — `makePlanStore` implements `loadBatchEntries` (same
  query shape as `loadCurrentBatch`'s entries half, addressed by id).
- `src/lib/planConversation.test.ts` — its in-memory fake `PlanStore`
  implements `loadBatchEntries` too (interface addition).
- `src/lib/botActions.ts` — new `ShowMenuAction`; `planActions` maps the
  `show_menu` intent to it (read-only; deliberately not added to
  `WRITE_ACTIONS`).
- `src/lib/intentParser.ts` — new `show_menu` intent (null slot spec, a
  `CLASSIFY_PROMPT` line, and a rules-layer pattern for "visa menyn" /
  "vad blir veckans meny" / "show the menu", placed before `show_list`'s
  patterns — "menyn" never collides with a shopping-list word).
- `src/lib/intentParser.test.ts` — "visa menyn" added to
  `MUST_BE_RULED` (must never need an LLM call).
- `bot/tools.ts` — `runShowMenu` (shared by the free-text `show_menu`
  action and the `[📋 Meny]`/on-demand callback) resolves the target
  batch and calls `sendMenuCard`. `runPlanEvent` now detects a
  successful lock by RE-DERIVING from the DB — `loadLockedBatches()`
  before and after `handlePlanEvent` — rather than trusting the "lock"
  event always succeeds: an overlap clash or an empty draft answers with
  a message and locks nothing, and must not trigger a menu send (there'd
  be nothing new, or a stale older batch would get re-sent). Only a
  batch COUNT increase fires `sendMenuCard`.
- `bot/tools.test.ts` — `makeTelegram()`'s fake gained `sendMediaGroup`/
  `sendDocument` capture and `sendMessage`'s `parseMode`; two new tests:
  locking sends `[edit, media, send, document]` in order with the menu's
  HTML/buttons intact, and a refused (overlapping) lock sends neither.
- `docs/research/r6-track-b-runbook.md` — `## Amendments` section
  (new): the chromium install prerequisite for `bot/menuPdf.ts`
  (`npx playwright install chromium`; `@playwright/test` was already a
  dependency, so no new package).
- `docs/execplans/p5-05-batch-compare-handoff.md` — step 4's Progress
  item ticked (2026-08-27), pointing at this plan for the commit hash
  (see below): the deferred lock-announcement handoff line landed here,
  and the plan also records that a SHORT batch-id prefix was considered
  and rejected — `compare/cli.ts`'s `--batch` / `compare/batchFetch.ts`'s
  `resolveBatchId`+`fetchBatchRows` match ids exactly (`eq("batch_id",
  ...)`), no prefix support — so the full id is printed instead.

### Post-implementation review pass (agent code review, before commit)

An independent review of the full diff surfaced two real issues, both
fixed with new test coverage before committing:

- **Blocker**: Telegram's `sendMediaGroup` rejects fewer than 2 items,
  but `bot/menu.ts` called it for ANY non-empty album — a batch with
  exactly one distinct dish (a 1-day lock, or a whole horizon that's a
  single storkok/meal-prep dish, both real cases the feature supports)
  would silently fail to send its photo (`TelegramApi.call()` logs and
  swallows, per its existing design). Fixed: `TelegramApi` gained
  `sendPhoto`; `bot/menu.ts`'s `sendMenuCard` uses it for exactly one
  photo, `sendMediaGroup` for 2+, and sends nothing for 0. New test:
  `bot/menu.test.ts`'s "uses sendPhoto (not sendMediaGroup) when the
  batch has exactly one distinct dish".
- **Worth-fixing**: a storkok pair's two pool entries can be scaled
  INDEPENDENTLY (the edit flow addresses entries by index —
  `planConversation.ts`'s `"multiplier"` case), but the collapsed menu
  line's `?scale=` param read only the first entry's multiplier while
  the SAME line's "×N portioner" reading elsewhere
  (`poolLineText`) takes the max — a reachable copy/link mismatch. Fixed:
  `menuDishUrl`'s scale now also takes `Math.max(...line.multipliers, 1)`.
  New test: `src/lib/menuCard.test.ts`'s "uses the max multiplier for the
  collapsed line's scale param".

### `npx vitest run` (new/touched files)

```
$ npx vitest run src/lib/menuCard.test.ts bot/menuPdf.test.ts bot/menu.test.ts bot/tools.test.ts src/lib/planConversation.test.ts src/lib/intentParser.test.ts
 Test Files  6 passed (6)
      Tests  183 passed (183)
```

### `npm test` (full suite)

```
$ npm test
 Test Files  22 passed (22)
      Tests  411 passed (411)
```

### `./harness check`

```
$ ./harness check
check: deps ... OK (73 deps present)
check: npm run lint ... OK (8/8 warnings)
check: npm test ... OK
check: npm run build ... OK
check: tsc bot ... OK
check: tsc compare ... OK
check: plans --validate ... plans validate: OK (31 plans)
check: validate-recipe ... validate-recipe: OK (30 recipes)
check: OK
```

### `./harness e2e`: skipped, with rationale

No page/component under `src/pages` or `src/components` (nor
`src/App.tsx`) imports `menuCard.ts`, `planConversation.ts`,
`botActions.ts`, or `intentParser.ts` (checked by grep) — these are
bot-only logic that happens to live in `src/lib` for the shared-loader/
testability reasons p4-03 already established. `npm run build` passing
is the full extent of "web-imported" exposure for this change; the
deployed app's runtime behavior is unchanged, so `./harness e2e` was not
run.

### PDF link-annotation proof (excerpt, `bot/menuPdf.test.ts`)

```
$ npx vitest run bot/menuPdf.test.ts
 ✓ renderMenuPdf > produces a real PDF
 ✓ renderMenuPdf > preserves the <a href> as a clickable PDF link annotation (/URI)
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

The second test decompresses every `FlateDecode` stream in the produced
PDF and asserts `/URI` plus the target host appear somewhere in the raw
bytes or an inflated stream — Chromium's newer PDF export can place
`/Annots` inside a compressed object stream, so a plain-bytes grep alone
would silently pass on a PDF with NO real links.

### Deep-link format check against the deployed Pages app

Read-only, no credentials used (per the stop-and-ask rule on
credentials): navigated the Browser pane to
`https://peralmq.github.io/vega-plan-hub/?recipe=mapo-tofu&scale=2`
(logged out). Landed on the Landing page; `location.href` read back as

```
https://peralmq.github.io/vega-plan-hub/welcome?recipe=mapo-tofu&scale=2
```

confirming the exact `recipe`/`scale` param pair this plan's links use
survives the `/welcome` auth redirect, per p4-11's (already live-verified)
contract. This does not exercise the post-login "opens the dish, scaled"
behavior — that needs a household sign-in this session has no
credentials for — so the Progress item stays unticked.

### Residual contract risk

- **PDF album images that fail to load**: `page.setContent(html, {
  waitUntil: "load" })` fires once the `load` event dispatches; a slow or
  dead third-party recipe-image host (several corpus entries hotlink to
  blog CDNs) could still be mid-fetch when the PDF is captured, rendering
  a broken-image box in the PDF for that one photo. Not addressed here —
  no `waitUntil: "networkidle"`/explicit image-load wait was added, to
  keep the render fast and because `RecipeImage.tsx`'s own broken-image
  handling (p4-13) shows the same class of source is already accepted
  as a known risk for the web app. Would show up as a cosmetic PDF
  defect, never a crash or a wrong link.
- **`placeholder.svg` in the Telegram album**: Telegram's `sendMediaGroup`
  photo type has inconsistent SVG support; if a real recipe ever ships
  with a genuinely blank `imageUrl`, that album call could 400 on
  Telegram's side for that one photo (or, per Bot API album semantics,
  possibly the whole batch call). Not exercised live — every shipped
  recipe currently has a non-empty `imageUrl` (checked via grep), so this
  is a defined-but-unexercised edge captured only by the unit test's
  fixture, not a live send. The text menu and PDF are unaffected either
  way (they render the placeholder as a normal `<img>`).
- **`📖 Recept` button destination**: the plan's Goal text names three
  menu-message buttons without specifying where `[📖 Recept]` should
  link; no route in `docs/specs/design.spec.md` is named "the recipe
  library" outside Plan Mode's own "recipe picker from the library"
  description. Implemented as `${cookModeBaseUrl()}plan` (the deployed
  `/plan` route) — a judgment call, not a spec citation; flagging for
  human review rather than silently deciding it's obviously right.
- **`bot/README.md`'s promised r6 runbook amendment never actually
  landed**: `bot/README.md`'s p4-08 section says "`github.com` added to
  the egress allow-list (r6 runbook amendment)", but
  `docs/research/r6-track-b-runbook.md` had no such amendment before
  this change (grepped for "github"/"allow-list" — nothing). Left
  as-is; fixing a different plan's stale cross-reference is out of this
  plan's scope, flagged here rather than silently repaired.
- Per-plan bullets already called out above: Progress items 5 and 6
  (deep-link live check, household live approval) are unticked and
  human-only, so `status` stays `in-progress`.

(recorded during implementation)
