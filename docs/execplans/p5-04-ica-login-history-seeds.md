---
id: p5-04-ica-login-history-seeds
title: ICA login tier + purchase-history seeding (ICA favorites, Axfood history)
phase: P5
status: done
depends_on: [p5-03-fee-aware-totals]
---

## Goal

Two asks from Pelle (2026-08-16, reversing/extending the p5-01 gate
defaults, tech.spec amended in the same change set):

1. **ICA login tier**: authenticate with the household's ICA account
   so ICA stops being the comparison's blind spot — slot times/fees
   for the wanted day/window (today: "check at checkout") and the
   household's favorites/"Återkommande" surfaces.
2. **Purchase-history seeding everywhere we have history**: pin the
   products the household actually buys (the p5-01 seed layer, today
   Mathem-only) from each store's own history — ICA favorites/
   "Återkommande" and **Willys** purchase history (account has
   real history; Hemköp rides the same Axfood code path for free
   even if its fresh account has none yet).

## Non-goals

- No checkout, slot booking, or payment — cart-ready boundary
  unchanged (tech.spec 🚫-never).
- No BankID automation: if ICA's login flow demands BankID, the
  human step is recorded honestly and the tier degrades to
  anonymous search (+ ICA_COOKIE fallback) rather than us scripting
  around an authentication ceremony.
- No CAPTCHA/WAF bypass — polite-client rules hold; if the WAF
  blocks the login flow for non-browser clients, that finding is
  evidence, not an obstacle to hack past.
- No list-push to the ICA app in this plan (can be a follow-up if
  the household wants it).

## Context

- p5-01 evidence: ICA per-store shop = `handlaprivatkund.ica.se/
  stores/{accountId}/...` (v6 search, anonymous, AWS WAF); slot API
  `POST .../api/ecomslots/v2/slots` needs `deliveryDestinationId` +
  `regionId` which anonymous probing could not create (403/405) —
  expected to exist behind a logged-in session. Favorites surfaces
  confirmed in the header nav: `/stores/{id}/favorites`, `/lists`,
  `/regulars`. Login route 302s to ICA's central IdP
  (ims.icagruppen.se) — flow to be reverse-engineered live.
- Community precedent (docs/research/store-integration-landscape.md):
  ica-mcp/ica-cli era used personnummer+password against the legacy
  api.ica.se, killed in the 2024 crackdown — nothing current is
  known-good; this plan documents whatever the live flow turns out
  to be.
- Seed layer is store-agnostic by design (p5-01):
  `pickBest(term, products, seeds)` — a new store only needs its
  history endpoint mapped into `StoreProduct[]`.
- Axfood (Willys/Hemköp) authenticated session already exists
  (`compare/axfood.ts`); purchase-history/frequently-bought
  endpoint to be mined from the site (same v1 REST surface as
  slots).
- Credentials: `compare/.env` pattern (mode 600, gitignored);
  ICA keys are a human step for Pelle, Willys/Hemköp keys exist.

## Progress

- [x] Axfood history seeds: `account/orders` + `orderdata?q=` mined
      live (both current on the v1 surface), orderHistory() on the
      session, commonProductsFromOrders + validateAxfoodOrders in
      storeCompare (scrubbed 3-order fixture), wired for
      willys/hemkop, ★ staples live-verified on the household's
      real repeat buys
- [x] ICA login flow reverse-engineered and implemented
      (`compare/ica-auth.ts`): shop login route → OAuth authorize
      (client OcadoB2C) → Curity IdP — BankID default, but the
      "Lösenord" authenticator (`/authn/authenticate/IcaCustomers`)
      takes `userName` (personnummer) + `password` as a form POST;
      per-host cookie jars carry the resumed session back to
      handlaprivatkund. **Live-verified with household credentials
      2026-08-16.** Two browser-only steps replayed server-side:
      the Curity auto-submit form (hidden token/state POSTed to the
      OAuth resume path) and the shop's /sso-login page whose JS
      GETs `/stores/{id}/sso-login/auth?iss=&code=&state=` for the
      cookie-setting code exchange; login() verifies the session by
      confirming /favorites no longer bounces to /login
- [x] ICA seeds: favorites **live with ★ pins** —
      `GET /stores/{id}/api/webproductpagews/v6/product-pages/
      favorites?maxPageSize=100&maxProductsToDecorate=100&tag=web`
      (maxProductsToDecorate is load-bearing: without it the
      envelope carries only bare otherProductIds); standard v6
      productGroups envelope, extractIca unchanged; WAF-challenge
      detection (202/x-amzn-waf-action → one patient 15s retry,
      never solved). "Återkommande"/orders API paths 404 to all
      guesses — favorites (the household's own curated list) is
      the seed source, 100 products decorated
- [x] ICA slot tier — step 4's else-branch taken, recorded
      honestly: with the session, `/stores/{id}/delivery` now
      renders (448KB SPA page, previously login-bounced) so slots
      are human-reachable, but the JSON contract still wants a
      deliveryDestinationId (`next-available-slot` 400s) and no
      destination API answers under guessable paths — extracting it
      means mining the SPA chunks, deferred; the comparison keeps
      "eligibility by zip, times at checkout" for ICA
- [x] Mathem history seeds (Pelle 2026-08-16: "Mathem also has
      purchase history"): get_orders embeds full product objects per
      order — commonProductsFromMathemOrders + validateMathemOrders,
      merged with likely_to_buy via mergeSeeds (history first,
      deduped by id); scrubbed 3-order fixture; live ★ pins from
      real history (Yipin Tofu, Garant Bladspenat) alongside a
      surviving likely_to_buy pin (Lök Gul Påse)
- [x] Fixtures + `./harness check` green; README/env skeleton
      updated (ICA_PERSONNUMMER/ICA_PASSWORD appended empty)
- [x] Live evidence with household ICA credentials (Pelle filled
      the keys 2026-08-16) — see Evidence

## Steps

1. **Axfood history seeds first** (credentials already live): mine
   willys.se for the frequently-bought/purchase-history endpoint,
   port it into `compare/axfood.ts` (read-only GET), extract to
   `StoreProduct[]`, thread as seeds for willys/hemkop in the CLI,
   fixture-test extraction + drift validator, live-verify with the
   household Willys account.
2. **ICA login**: walk the live login redirect chain
   (handlaprivatkund → ims.icagruppen.se), implement the flow in
   `compare/ica-auth.ts` with ICA_PERSONNUMMER/ICA_PASSWORD from
   compare/.env; record honestly if BankID or WAF blocks it.
3. **ICA seeds**: with a session, fetch favorites + "Återkommande",
   extract to StoreProduct seeds, thread into the CLI for ica.
4. **ICA slots**: retry `ecomslots/v2/slots` with the session
   (deliveryDestination via the logged-in surface); if it works,
   wire fees via the p5-03 model (validator + fixture); else keep
   "times at checkout".
5. Fixtures for every new extraction; `./harness check`; live
   evidence once Pelle fills the ICA keys.

## Verification

- `./harness check` passes; new extraction/validators fixture-tested.
- Seeds visibly pin household staples in a live run for every store
  with history (★ markers), and weak seeds never pin (existing
  invariant holds).
- ICA: either a live authenticated run (slots and/or seeds) or an
  honest recorded blocker with the fallback intact.
- No credential material in repo or evidence.

## Evidence

**2026-08-16 (Axfood history seeds live; ICA login built, awaiting
credentials):**

- Willys endpoint probe (logged in, read-only): the March-era
  community endpoints partly survive — `account/orders` (also at
  `v1/`) and `orderdata?q={orderNumber}` both 200; every
  `mostpurchased`-style guess 404s; the CMS "minavanligastevaror"
  page exists but order lines are the richer source. Household
  account has 6 real orders.
- Order lines are AxfoodRawProduct supersets → existing
  `extractAxfood` applies. Real-data finding: delisted lines carry
  `priceValue: null` (including Willys' own paper bag as an order
  line) — validator accepts number|null, seed builder skips
  unpriced lines.
- Seed correctness fix that fell out of review: a pinned seed now
  takes today's search-result price when the same product code is
  in the results (order-history prices are stale by definition);
  regression test added.
- `npx vitest run src/lib/storeCompare.test.ts` → 24 passed. Live:
  `--stores willys` on [spenat, tofu naturell, gul lök] →
  "✓ spenat: Spenat Klass 1 — 19,90 kr ★ staple · ✓ tofu naturell:
  Tofu Naturell Ekologisk Vegansk — 27,90 kr ★ staple" — the
  household's actual repeat buys, at current prices. Hemköp rides
  the same code path (fresh account, no history yet — degrades to
  no seeds).
- ICA login flow walked anonymously and mapped (see Progress);
  implemented in `compare/ica-auth.ts` with per-host cookie jars.
  Full-chain smoke with a nonexistent personnummer reaches the
  credential check and fails with our message — every hop before
  it verified. `npm run ica-probe` stands ready to (1) verify a
  real login and (2) print the favorites/regulars/slot endpoint
  map (statuses + keys only, no bodies/personal data).
- `./harness check` OK before each commit. Commits: 2502984 (gate
  amendment + plan), 91c5ec7 (Axfood seeds), d6a1082 (ICA login).

**2026-08-16 (Mathem history seeds; ICA keys deferred by Pelle):**

- Pelle: "Mathem also has purchase history" — get_orders probed:
  `{hasMore, orders[10]}`, each order embeds
  `products[{product, quantity, totalGrossAmount}]` with the
  standard MCP product shape → extractMathemMcp applies unchanged.
  Scrubbed 3-order fixture (46+40+29 lines, product fields only).
- Seeds for Mathem are now history-first: order-history staples
  (frequency-ranked) merged with likely_to_buy backfill, deduped by
  id (mergeSeeds). Cache key bumped mathem:likely_to_buy →
  mathem:seeds. 28 storeCompare tests green.
- Live: [spenat, tofu naturell, gul lök] at Mathem → all three ★:
  "Garant Eko Bladspenat EKO Fryst" + "Yipin Tofu Naturell EKO"
  from history, "Lök Gul Påse Klass1 Sverige" surviving from
  likely_to_buy — merge works as designed.
- ICA: Pelle defers filling the keys ("I'll fix the Ica login
  later") — the remaining Progress items stay open on that human
  step; everything code-side is ready (`npm run ica-probe`).

**2026-08-16 (ICA live — login, favorites seeds, plan done):**

- Pelle filled the keys. First real submission exposed two
  browser-only steps the smoke test couldn't see: the Curity
  "Redirecting…" auto-submit form (hidden token/state → OAuth
  resume) and the shop's /sso-login page whose JS GETs
  `/stores/{id}/sso-login/auth?iss=&code=&state=` for the
  cookie-setting code exchange. Both replayed server-side in
  login(); session verified by /favorites no longer bouncing.
- Session persistence added (compare/.ica-session.json, mode 600,
  gitignored): ensure() reuses cookies and only re-runs the
  ~8-request login chain when stale — the politest posture toward
  ICA's rate-based WAF, which this session's repeated login rounds
  did trip (202 + x-amzn-waf-action on favorites twice; clean
  after a cool-down, and production cadence is one fetch/12h).
- Favorites: empty until `maxProductsToDecorate=100` was added
  (load-bearing param, same as search) — then 100 decorated
  products. Live ★ pins from "Dina favoriter": "Gul lök 1kg
  Klass 1 ICA" (favorite 1kg beat search's 500g and cut the basket
  57,15→55,66), "Kikärtor 380g ICA", "Bladspenat Fryst Ekologisk
  450g ICA I love eco", "Tofu naturell Ekologisk 400g KRAV YiPin".
- **Emergent resilience**: on the staple-list run the WAF
  challenged the two live searches, yet both terms still matched
  ★ from seeds alone — favorites keep ICA usable during
  challenges (empty search + good seed → seedPin, 0 alternatives).
- Cache subtlety fixed in passing: cached() stores any non-null
  value, so the pre-fix empty favorites array was cached; entry
  invalidated manually, real result now cached 12h.
- Slot tier closed on step 4's else-branch (see Progress).
- `./harness check` OK. Plan complete: ICA login live, ICA
  favorites + Mathem/Willys history seeding live, Hemköp
  activates with its first orders.
