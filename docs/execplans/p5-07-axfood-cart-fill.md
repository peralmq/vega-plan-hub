---
id: p5-07-axfood-cart-fill
title: Axfood cart-fill — --fill-cart hemkop|willys via the account tier
phase: P5
status: in-progress
depends_on: [p5-04-ica-login-history-seeds, p5-06-ica-cart-fill]
---

## Goal

Directive from Pelle (2026-08-30, in chat): the household shops this
batch at Hemköp but "det är riktigt jobbigt att hitta rätt varor" —
"kan man bygga en --cart enkelt?". Extend `--fill-cart` to the Axfood
chains: push the matched basket into the household's account cart on
hemkop.se / willys.se (same platform, both nearly free once one
works), then print the review URL. The account cart is what the
household sees on next login — no session-handoff problem, which was
the p5-01 research blocker for the anonymous variant.

Reverses p5-05's Mathem-only cart non-goal for a second store family;
spec-first per AGENTS.md — tech.spec's Willys/Hemköp wording amended
in this change set.

## Non-goals

- No checkout, slot booking, or payment (tech.spec 🚫-never). The
  session's slot read stays read-only; `DELETE /cart` (clear) is never
  called.
- Quantities stay one-unit-per-term with the batch quantity printed as
  the human's cue (p5-05 v1 semantics).
- No anonymous-cart variant (JSESSIONID carts can't be handed over —
  p5-01 research); credentials required, same as the slot tier.

## Context

- Endpoints from ErikHellman/willys-agent (MIT, same source as the
  p5-04 login flow) + the p5-01 research doc's live verification:
  `GET /axfood/rest/cart` (readback), `POST
  /axfood/rest/cart/addProducts` with `{products: [{productCodePost,
  qty, pickUnit: "pieces", hideDiscountToolTip, noReplacementFlag}]}`.
  **`qty` is a SET, not a delta** (qty 0 removes) — the opposite of
  ICA's apply-quantity, so the convergent fill simply skips products
  already in the cart and never sends their codes at all.
- Read-only probe 2026-08-30 (Hemköp account, scrubbed): cart GET →
  200; key fields `products[]`, `totalUnitCount`,
  `subtotalWithDiscountsAndPercentageVouchers.{value,formattedValue}`.
  Product-line shape captured after the first live add (cart was
  empty at probe time).
- `cartPlan` + the convergent-op planning (p5-06 `icaFillOps`) are
  already store-agnostic; Axfood search results carry `code` as the
  product id (`extractAxfood`).

## Progress

- [x] Execplan filed; tech.spec Willys/Hemköp wording amended — this
      change set.
- [x] Endpoint discovery: willys-agent source + read-only cart probe +
      one-item add/remove probe (line shape captured, cart left empty).
- [x] `AxfoodSession.cart()` + `addProducts()` (per-item POST, qty is
      a set; header comment no longer claims read-only).
- [x] `validateAxfoodCart` (pure, loud on shape drift) + fixture tests
      incl. the scrubbed live capture.
- [x] CLI: `--fill-cart hemkop|willys` through the standard pipeline
      (validation, convergent fill, shared print, `--json`); README.
- [x] `./harness check` green; commit 4d5a93f.
- [x] Live: current batch carted at Hemköp, cart handed to the
      household for review + checkout.

## Steps

1. File plan + tech.spec amendment (this change set).
2. `AxfoodSession`: `cart()` + `addProducts()` (CSRF handling exists;
   header comment updated — no longer read-only).
3. Pure cart readback validator (loud on shape drift) + fixture tests;
   scrubbed live capture once the first add succeeds.
4. CLI wiring mirroring the ICA fill (shared print path,
   `--fill-cart mathem|ica|hemkop|willys` validation, per-chain
   credential check); README updated.
5. `./harness check`, commit, live run on `--batch latest --stores
   hemkop --fill-cart hemkop`.

## Verification

- `./harness check` passes; validator fixture-tested including the
  shape-moved loud failure.
- Live: `npm run compare -- --batch latest --stores hemkop
  --fill-cart hemkop` adds the matched basket; printed totals match a
  cart GET readback; the cart is visible in the household's hemkop.se
  account for review + checkout.
- No credential material in repo or evidence.

## Evidence

**2026-08-30 (discovery):**

- Endpoint contract confirmed against willys-agent source (fetched
  from GitHub): add/read/clear as in Context; qty-is-a-set semantics
  (`qty: 0` is willys-agent's own remove).
- Read-only Hemköp cart probe (structure scrubbed to types): 200,
  envelope fields as in Context; `products` empty pre-fill.
- One-item add/remove probe: add 200 → readback line carries
  `code`/`quantity`/`name` (fixture captured, scrubbed); qty 0
  removed it cleanly (cart back to 0 — no probe artifacts left).

**2026-08-30 (live fill — first Axfood cart run):**

- `--batch latest --stores hemkop --fill-cart hemkop` (cache-warm
  searches from the day's comparison): **66 ops sent, 0 refused**,
  readback 66 items / 1 530,45 kr matching the printed totals; the
  duplicate "salt" rows collapsed into one qty-2 op as planned. 2
  terms unmatched (bambuspett, mild currypulver), 36 weak matches
  flagged into the cart for the household's review — the known
  matcher residual (e.g. "doubanjiang" → glass, "färsk ingefära" →
  färskost) is the term-normalization follow-up, not this plan.
- Contract behaviors verified live: account cart visible cross-
  session (probe add seen by a later login), per-item POST isolation,
  convergent skip untested against a non-empty cart this run (cart
  started empty) — the ⏭ path is fixture-tested and shares p5-06's
  live-proven planner.
