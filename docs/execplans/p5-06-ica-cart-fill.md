---
id: p5-06-ica-cart-fill
title: ICA cart-fill — --fill-cart ica via the household login tier
phase: P5
status: in-progress
depends_on: [p5-04-ica-login-history-seeds, p5-05-batch-compare-handoff]
---

## Goal

Directive from Pelle (2026-08-28, in chat): "buy the current planned
meals using Ica this time … connect Ica in a good way so we can create
the grocery shopping cart." Extend `--fill-cart` to `ica`: push the
matched ICA basket into the household's handlaprivatkund.ica.se cart
(default store: Maxi ICA Stormarknad Lindhagen, account 1003418) using
the p5-04 authenticated session, then print the cart URL for human
review — the household adds their extra ICA products and checks out in
the shop, as always.

This reverses p5-05's "no new cart integrations — `--fill-cart` remains
Mathem-only" non-goal; spec-first per AGENTS.md, tech.spec's ICA wording
is amended in the same change set.

## Non-goals

- No checkout, slot booking, or payment — cart-ready boundary unchanged
  (tech.spec 🚫-never). The cart service's checkout-* endpoints mapped
  during discovery are never called.
- No WAF-challenge solving (polite-client rule): if the cart POST is
  challenged, the honest fallback is the existing `ICA_COOKIE` escape
  hatch (browser-copied cookie header, human-obtained), not a bypass.
- Quantities stay one-unit-per-term with the batch quantity printed as
  the human's cue (p5-05 v1 semantics, unchanged).
- No list-push to the ICA app (still a possible follow-up; this plan is
  the online-shopping cart).

## Context

- p5-04: ICA login live (`compare/ica-auth.ts`, Curity password
  authenticator, per-host cookie jars, persisted session in
  `compare/.ica-session.json`); authenticated GETs pass the WAF, the
  slots POST was consistently challenged — cart POST risk is the same
  and is handled honestly (detect → one patient retry → ICA_COOKIE
  guidance).
- Cart service mined from the shop's static chunk
  (`/static/index-*.js`, offline analysis, p5-04 method): service
  `web_basket_ws`, client path prefix `/api/cart` under
  `/stores/{accountId}` —
  `GET /api/cart/v1/carts/active` (envelope: `items[]`,
  `totals.itemPriceAfterPromos.{currency,amount}`, checkout groups),
  `POST /api/cart/v1/carts/active/apply-quantity` with a JSON array of
  `{productId, delta}` (the site's own `addBasketItems` action;
  negative delta removes). CSRF: `X-CSRF-TOKEN` from the store page's
  `window.__INITIAL_STATE__` → `session.csrf.token`.
- Read-only probe 2026-08-28 (persisted session, keys only): both cart
  GETs 200, active cart empty, envelope as above.
- `cartPlan` (src/lib/storeCompare.ts) is already store-agnostic —
  ICA ops map `productId` (v6 UUID, what `extractIca` carries) +
  `delta: quantity`.

## Progress

- [x] Execplan filed; tech.spec ICA wording amended (cart-fill via the
      login tier, adopted 2026-08-28) — this change set.
- [x] `IcaSession`: cart methods (`addToCart`, `activeCart`, CSRF
      fetch), `ICA_COOKIE` override for handlaprivatkund requests,
      `ensureAny()`; header comment no longer claims read-only.
- [x] `validateIcaCart` (pure, loud on shape drift) + tests.
- [x] CLI: `--fill-cart ica` wired through the standard pipeline
      (validation, fill, print, `--json`); README updated.
- [x] `./harness check` green; commit.
- [x] Live: current batch carted at ICA from this session (12 products
      after cleanup), cart URL handed to the household for review +
      checkout. Residual: ~45 of 59 terms had their searches
      WAF-challenged in this session's burned rate window — the
      convergent fill exists precisely so a cool-down re-run tops the
      cart up without doubling.

## Steps

1. File plan + spec amendment (the reversal directive recorded).
2. Cart client on `IcaSession` with WAF-challenge detection (202 /
   `x-amzn-waf-action` → one 15s retry → error naming `ICA_COOKIE`).
3. Pure cart readback validator with fixture tests (envelope from the
   live probe; scrubbed live capture once the first add succeeds).
4. CLI wiring mirroring the Mathem fill (shared print, per-store
   summary line), `--fill-cart mathem|ica` validation.
5. `./harness check`, commit, then the live run on `--batch latest`
   (batch-handoff keys copied verbatim into `compare/.env` per the
   p5-05 same-key-names design).

## Verification

- `./harness check` passes; validator fixture-tested including the
  shape-moved loud failure.
- Live: `npm run compare -- --batch latest --stores ica --fill-cart
  ica` adds the matched basket; the cart totals printed match a GET
  readback; cart URL opens with the items visible for review.
- No credential material in repo or evidence.

## Evidence

**2026-08-28 (discovery + implementation):**

- Chunk mining (one 2MB static download, offline grep): full cart
  service contract as in Context; also present in the same service:
  `add-items`, `remove-items`, `merge-items`, `select`/`unselect`,
  vouchers, and `checkout-*` routes (the latter never to be called —
  cart-ready 🚫-never).
- Read-only probe with the persisted p5-04 session: `GET
  /stores/1003418/api/cart/v1/carts/active` → 200, `items: array[0]`,
  totals envelope `{currency, amount}`; `v2/carts/active/cart-view`
  also 200. No WAF challenge on either GET.
- Implementation: `compare/ica-auth.ts` (cart methods + `ICA_COOKIE`
  override + `ensureAny`), `validateIcaCart` + `icaFillOps` in
  `src/lib/storeCompare.ts` (loud shape-moved error; convergent-fill
  op planning) with 7 new tests incl. the scrubbed live capture
  `src/lib/__fixtures__/ica-cart.json`, CLI `--fill-cart ica` sharing
  the Mathem print path (per-store summary line), README.
- `./harness check` → OK (all gates); commit recorded on handoff.

**2026-08-28 (live iteration — endpoint semantics pinned down):**

- First batch write 400'd. Empirical single-item probes (variants:
  bare array / extra headers / meta / items-wrapper): the bare
  `[{productId, quantity}]` array is correct and returned 200 —
  no WAF challenge on any authenticated cart POST this session
  (the p5-04 slots-POST fear did not materialize for the cart
  service; detection + ICA_COOKIE guidance stay in as insurance).
- **`quantity` is a DELTA** despite its name (live-verified:
  duplicate payload entries stack to qty 2, quantity 0 is a no-op,
  −1 removes) — matching the site's optimistic `{productId, delta}`
  reducer. The 400 on the full batch was payload-level (a bad
  product 400s everything): per-item fallback added, rejected
  products reported `✗ shop manually` instead of sinking the fill.
- Convergent fill (`icaFillOps`): duplicate list rows collapse into
  one op (summed), products already in the cart are skipped `⏭` —
  re-runs converge; needed because challenged searches aren't cached,
  so topping up after a WAF cool-down is the expected workflow.
- Live fill on batch d6595503 (59 items): 13 ops added (2 weak
  ⚠-flagged), readback 406,55 kr; probe artifacts cleaned via −1
  deltas (probe product removed, duplicate collapsed) → cart left at
  12 products for review at
  `handlaprivatkund.ica.se/stores/1003418/cart`. ~45 terms'
  searches were WAF-challenged (this session's probing burned the
  rate window) → re-run after cool-down tops up convergently.
- Match-quality residual (matcher, not this plan): substring token
  coverage lets generic terms pin wrong favorites ("salt" →
  Lättsaltade chips ★, "vatten" → Kokosvatten ★, "mjölk" →
  barnmat med kokosmjölk ★) — flagged as follow-up work; the
  cart-ready human review is the safety net meanwhile.

**2026-08-29 (top-up run — convergent fill verified live; WAF search
posture recorded):**

- Re-run next day (12h cache expired, all 59 terms re-searched):
  every already-carted product skipped `⏭ left as-is` — zero
  doubling, the convergent design working live — and 2 newly
  matched items added (ketchup, vitpeppar). Cart at handoff:
  **14 items, 411,28 kr**.
- WAF finding: even after a >12h cool-down, ~50 of 59 searches were
  challenged — this client fingerprint is being challenged
  near-systematically now, while all authenticated cart
  reads/writes pass untouched. Honest posture per polite-client
  rule: no further automated search retries; the ICA_COOKIE hatch
  (or manual carting in the shop, where the household is headed
  anyway) covers the remaining terms. Most remaining unmatched
  terms are recipe-style lines ("gul lök, finhackad") that need
  the term-normalization improvements, not more search attempts.
