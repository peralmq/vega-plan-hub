---
id: p5-01-store-comparison-spike
title: Store comparison spike — Mathem MCP + multi-chain price/delivery compare
phase: P5
status: in-progress
depends_on: []
---

## Goal

From a Vega shopping list, produce a cross-store comparison the
household can act on: per store, the matched basket with total price,
unmatched items, and — the decision-driving filter — **whether the
store can deliver on day X around time Y** to the household address.
Stores in scope — all five: **Mathem via its official MCP server**
(launched 2026-08-07, OAuth + dynamic client registration verified
2026-08-16), **Willys / Hemköp / Coop via Erik Hellman's
MIT-licensed CLI suite** (willys-agent, hemkop-cli, coop-cli — the
same trio his food-shopping-agent drives), and **ICA pinned to one
particular ICA store** (ICA online shopping is per-store at
`handlaprivatkund.ica.se/stores/{storeId}`; the household's store is
chosen by Pelle at dispatch). Direction set by Pelle 2026-08-16,
ICA-inclusive scope confirmed same day.

This is a spike: it ends in working prototype evidence, a gate brief,
and the tech.spec boundary wording for the follow-up implementation
plan — not in shipped product surface.

## Non-goals

- **No checkout or payment automation, ever** — the community's
  "cart-ready, never checkout" convention is also ours; the flow ends
  with the human reviewing cart + slot in the store's own UI.
- No store credentials in the repo — bot/.env pattern on the M1 only
  (r6 runbook), same as the Telegram token.
- No new Supabase schema in this spike (any persistence lands with
  the implementation plan, ask-first as usual).
- No web-admin UI work — output is CLI/agent-consumable JSON plus a
  readable summary; surfaces come later.

## Context

Research base: docs/research/store-integration-landscape.md (two
rounds, 2026-08-15). Facts verified 2026-08-16 that this plan builds
on:

- Mathem's OAuth AS (`https://www.mathem.se/o`) supports **dynamic
  client registration** (`/o/register/`), authorization-code + PKCE
  S256, refresh tokens, scope `mcp`, token auth `none` — a
  self-registered hobby client is possible; no partnership needed.
  MCP resource: `https://www.mathem.se/mcp` (401 + resource metadata
  confirmed). Tool list unknown until we complete OAuth.
- Hellman's four repos are all **MIT** (last pushed 2026-03-28):
  search + cart add/clear per chain; auth personnummer/email +
  password per chain. **None of them touch delivery slots** — the
  day-X/time-Y filter is our own work.
- Known slot surfaces: Willys/Hemköp (same Axfood platform)
  `/axfood/rest/tms/delivery-slots?postalCode=` + pickup variants,
  login-required (reference implementation: jimmystridh/willys-mcp,
  19 tools incl. slot selection). Mathem: marcusforsberg/ha-mathem
  does slot selection with a session; the official MCP may expose
  slots — check first. Coop: unknown, investigate in coop-cli's API
  or via the site.
- ICA: per-store **anonymous** product search works with a browser
  UA (`/stores/{storeId}/api/v5/products/search?term=`) — enough for
  the price-comparison leg with no credentials. Cart/list push needs
  auth: list tier via reverse-engineered OAuth
  (`ims.icagruppen.se` → `apimgw-pub.ica.se`; references
  kanylbullen/ica-mcp, mar-schmidt/ica-cli) or cart via a captured
  browser session (fragile; WAF 403s non-browser UAs). No known slot
  endpoint — slots shown at checkout per store; investigate with a
  session. ICA is the one store where the 2024 API-crackdown
  precedent argues for keeping the anonymous-search-only leg as the
  default and auth tiers opt-in.
- Prior art to study before writing code: simonnordberg/veckomenyn
  (pluggable store backends), ErikHellman/food-shopping-agent (the
  compare-and-fill-cheapest agentic loop this plan generalizes).

## Progress

- [x] Mathem MCP: client registered (dynamic registration), OAuth
      complete (Pelle approved 2026-08-16, refresh token stored),
      21 tools enumerated; slots wired into the CLI delivery filter
- [~] Hellman CLIs superseded by native adapters: Willys/Hemköp/Coop
      search all native in `compare/` (Coop via the personalization
      API, anonymous). Remaining from this item: slot tiers, which
      need household accounts (human steps)
- [x] ICA leg: default store = Maxi ICA Stormarknad Lindhagen
      (account 1003418, Pelle 2026-08-16); anonymous v6 search + WAF
      behavior mapped; auth tier still open (list push vs search-only)
- [~] `delivery_check`: ICA store-eligibility-by-zip live (anonymous);
      slot times per store still need auth (see Evidence)
- [x] Comparison CLI (`compare/`, `npm run compare`) with fixture
      suite in `./harness check` (tsc compare + 13 vitest cases)
- [x] Mathem cart-fill (`--fill-cart mathem`): matched basket pushed
      via manipulate_cart, cart URL printed for human review —
      cart-ready only, checkout stays in the shop
- [~] Favorites/commonly-bought seeding (Pelle 2026-08-16): **Mathem
      done** — likely_to_buy seeds pin fully-covering staples in the
      matcher (`★ staple` in output; weak staples never pin). ICA
      "Dina favoriter" / "Återkommande" waits on the login tier; the
      seed layer is store-agnostic (same `pickBest(term, products,
      seeds)` for any store's staples list)
- [ ] Gate brief incl. tech.spec boundary proposal

## Steps

1. **Mathem MCP first.** Register a client at `/o/register/`, run the
   authorization-code + PKCE flow with the household Mathem account
   (human step: Pelle logs in / approves — one step, per working
   agreement), then enumerate tools. Record: does it cover search,
   cart, shopping lists, delivery slots? Does an MCP-filled cart
   appear for review in the normal mathem.se checkout?
2. **Hellman CLIs.** Build/install willys-agent, hemkop-cli,
   coop-cli on the M1; verify each still works against the current
   sites (they're from March). Household accounts per chain are
   human steps (created by Pelle, credentials straight into
   bot/.env — never echoed). Chains without an account the household
   wants can be dropped; price-compare value degrades gracefully.
3. **ICA leg.** Pelle names the household's ICA store (human step);
   verify anonymous per-store search for the price-comparison leg.
   Decide the auth tier: default is search-only (comparison works
   with zero ICA credentials); the list-push tier (ica-mcp/ica-cli
   pattern, personnummer + password) is opt-in if the household
   wants "send list to ICA app" too.
4. **Slot availability per store.** Implement a read-only
   `delivery_check(store, postalCode, date, timeWindow)` probe:
   Axfood pair via `tms/delivery-slots`; Mathem via MCP tool if one
   exists, else the session ajax; Coop per findings from step 2; ICA
   per-store slots investigated with a browser session (no known
   endpoint — may land as "manual check at checkout" for ICA in this
   spike, recorded honestly in the comparison output). Output:
   matching slots (start, end, price) or "cannot deliver" or
   "unknown — check at store".
5. **Comparison harness.** A script that takes a shopping list
   (fixture file in the Vega list shape) + target day/time-window and
   emits per-store JSON: matched items with prices, unmatched items,
   basket total, delivery options passing the filter — plus a human
   summary table across all five stores. Product matching reuses
   `src/lib/ingredientNormalization` canonical names as search terms.
6. **Fixture the deterministic parts** (self-improvement rule):
   matching logic and comparison assembly run from committed fixture
   API responses in `./harness check`; live calls stay in the spike
   evidence only.
7. **Gate brief.** Evidence: one real household list compared across
   the working stores with the delivery filter live. Propose the
   tech.spec boundary wording (store integrations as outbound calls
   from the adopted M1 host; credential handling; which chains) and
   the p5-02 implementation plan scope. Spec change is Pelle's
   decision at the gate.

## Verification

- `./harness check` passes, including new comparison fixtures.
- Comparison harness on a fixture list: deterministic output from
  cached responses — per-store totals, unmatched items, and slot
  filter results match committed expectations.
- Live evidence recorded: Mathem MCP tool list; ICA anonymous search
  returning priced products for the household's chosen storeId; each
  working chain's cart filled from a real list and visible in that
  store's UI (ICA cart/list only if the auth tier was opted into);
  `delivery_check` returning real slots for the household postal code
  filtered to a day/time-window; at least one store correctly
  excluded by the filter (no slots in window) if reality provides
  one.
- No credential material anywhere in the repo or evidence text.

## Evidence

**2026-08-16 (dispatch + reverse-engineering + CLI v1):** Pelle
dispatched the plan directly ("go ahead and build this as a separate
tool", "the end tool would be good if it is a cli") — dependency on
p4-02 lifted at his direction; the capture bot's remaining smoke is
unaffected. Same day he set the ICA default store (Maxi ICA
Stormarknad Lindhagen) and added the favorites-seeding idea (tracked
in Progress).

Reverse-engineering findings (all live-verified 2026-08-16):

- **ICA has migrated domains**: `handlaprivatkund.ica.se` store URLs
  302 → `handla.ica.se?chooseStore=true`; the community-documented
  `/api/v5/products/search` is gone. Current shape (captured via
  in-browser network inspection): store chooser `handla.ica.se` calls
  **`GET /api/store/v1?zip={zip}&customerType=B2C`** (anonymous!) →
  all stores serving that zip with `deliveryMethods`
  (HOME_DELIVERY/PICKUP), address, accountId; the per-store shop
  still lives on handlaprivatkund with **search
  `GET /stores/{accountId}/api/webproductpagews/v6/product-pages/search?q=`**
  (v6, accountId not old storeId; productId UUID + retailerProductId,
  price/unitPrice envelopes).
- **ICA WAF**: AWS WAF challenges non-browser clients intermittently
  (202 + `x-amzn-waf-action: challenge`, empty body) — rate-based:
  plain curl worked, then got challenged mid-run. Browser sessions
  pass. CLI degrades per-term and suggests `ICA_COOKIE`.
- **ICA slots**: the slot API is
  `POST /stores/{accountId}/api/ecomslots/v2/slots` (body needs
  `deliveryDestinationId` + `regionId`; also
  `/v1/slots/next-available-slot`), extracted from the site's JS
  bundles. Creating a delivery destination anonymously via
  `api/address`/`ecomdeliverydestinations` returned 403/405 in all
  tried shapes — appears to need the logged-in checkout walk, and the
  `/delivery` route 302s to login. **Slot times therefore stay
  "check at checkout" for ICA until the household account tier**;
  store-level "can they deliver to my zip" is solved anonymously.
  Favorites surfaces confirmed in the header nav:
  `/stores/{id}/favorites`, `/lists`, `/regulars`.
- **Mathem/Willys/Hemköp anonymous search verified** (Hemköp =
  Willys' `search/clean` shape on hemkop.se). Mathem robots-policy
  bot UA used with contact email. Mathem's guessed
  `delivery-availability` ajax 404s — slots wait for the MCP.

Build (commit this change set): `compare/` CLI (`npm run compare`) +
pure logic in `src/lib/storeCompare.ts` with fixtures from real
captured responses (`src/lib/__fixtures__/store-search/*.json`, 4
stores × 5 terms, ICA captured through the WAF-blessed browser
session). Matching lesson encoded in tests: **stores legally rename
plant milk** ("havremjölk" → "Havredryck"), so token-coverage match
falls back to store relevance flagged `weak`; the inverse trap
(Hemköp returning "Havremjöl" — oat *flour* — as top hit) is pinned
to never silently count as good. `./harness check` green incl. new
`tsc compare` step; 11 new vitest cases.

Live run (`--list fixtures/compare-list.json --zip 11251 --day
2026-08-20 --window 17-20`): ICA 35,81 kr (3/5 before WAF challenge
kicked in, eligibility line: "Maxi ICA Stormarknad Lindhagen
home-delivers to 11251"), Mathem 64,52 kr (5/5), Willys 69,10 kr
(5/5), Hemköp 102,95 kr (5/5, havremjöl trap correctly ⚠-flagged).
Delivery lines report needs-auth honestly per store.

**2026-08-16 (Mathem MCP live + ICA mitigations):**

- **Official Mathem MCP fully working.** Dynamic client registration
  at `/o/register/` accepted a loopback public client; PKCE
  authorization-code flow via `npm run mathem-auth` (60-min loopback
  listener; tokens in gitignored `compare/.mathem-oauth.json`, mode
  600, refresh token present, inline auto-refresh in
  `compare/mathem-mcp.ts`). **21 tools**: product_search (multi-query),
  recipe_search, category/brand browse, **likely_to_buy** (returned
  50 real household staples with prices — exactly the
  favorites-seeding source Pelle asked for), unique_for_you,
  similar_and_related_products, get_cart / **manipulate_cart**,
  get_orders / get_order / order_tracking, get_delivery_addresses
  (household's Årsta address, id 8415637),
  **get_delivery_slots(delivery_dates)** / select_delivery_slot,
  product/dinner lists, liked/purchased recipes, feedback. Server
  instructions state "Checkout and payment happen in the shop, not
  through MCP" — the cart-ready principle is theirs too.
- **The day-X/time-Y filter is live for Mathem**: CLI run with
  `--day 2026-08-18 --window 17-20` → "6 slot(s) … 14:00–19:00
  (19 kr), 16:00–18:00 (49 kr), 17:00–19:00 (49 kr), 17:00–22:00
  (9 kr), …" (UTC→Europe/Stockholm conversion, overlap semantics,
  full/unavailable slots excluded).
- **ICA WAF mitigations** (Pelle asked for options): analysis —
  fingerprint+rate detection, not plain rate limiting (node fetch
  challenged immediately, curl/browser passed until rate rose).
  Implemented: 12h file cache (`compare/.cache/`) so repeat runs make
  ~zero ICA requests; ~2s jittered ICA pacing (others 250ms); one
  15s-backoff retry on challenge. Explicitly NOT solving the WAF
  challenge programmatically (bot-detection bypass — out of bounds);
  `ICA_COOKIE` from the household's own browser stays the manual
  fallback. Structural fix when the household opts into the ICA
  login tier: the app gateway (`apimgw-pub.ica.se`, ica-mcp/ica-cli
  pattern) — no WAF, and unlocks "Återkommande" seeding. Result:
  full 4-store run now matches 5/5 on ICA (57,15 kr — cheapest
  basket), zero challenges surfaced.

**2026-08-16 (Mathem cart-fill live):**

- Tool schemas pulled via `tools/list` (new `mcpRpc` helper):
  `manipulate_cart` takes `operations[]` — integer `productId` +
  `quantity` (positive adds, negative removes, `overrideQuantity`
  sets exact); returns the updated cart with a `url`. `get_cart`
  read-only, same cart shape.
- New pure `cartPlan(comparison)` in `src/lib/storeCompare.ts`
  (comparison → one add-op per matched term, weak kept + counted,
  unmatched → skipped) with 2 new fixture tests (13 total), incl.
  pinning that Mathem product ids are numeric strings since
  manipulate_cart wants integers.
- Live run `npm run compare -- --list fixtures/compare-list.json
  --zip 11251 --day 2026-08-18 --window 17-20 --fill-cart mathem`:
  cart was empty before; after — "🛒 Mathem cart filled — 5 item(s)
  added … → cart now 5 item(s): items 64,52 kr, cart total 170,52 kr
  incl. fees — review & checkout: https://www.mathem.se/se/cart/".
  Line items in get_cart match the comparison exactly (Oatly iKaffe
  17,95 / Garant Krossade Tomater 13,72 / Barilla Penne 15,95 / Gul
  lök 3,95 / Zeta Kikärtor EKO 12,95). **Cart `totalGrossAmount`
  includes ~106 kr of fees on top of line items** (likely delivery +
  small-order fee at this basket size) — CLI prints both numbers so
  the total is honest.
- Negative-quantity removal verified live: single-item re-add
  (kikärtor → 6 items) then `manipulate_cart [{productId: 4806,
  quantity: -1}]` restored the 5-item cart. Additive semantics
  confirmed: re-running --fill-cart adds again (documented in
  compare/README.md).
- The 5-item evidence cart is left in place for Pelle to review at
  mathem.se (verification step "cart visible in the store's UI").

**2026-08-16 (likely_to_buy seeding live):**

- `likely_to_buy` returns the household's 50 actual staples in the
  same flat product shape as cart lines (id/name/price/unitPrice/
  brand/url) — new `extractMathemMcp` extractor; trimmed 6-item real
  capture committed as `src/lib/__fixtures__/mathem-likely-to-buy.json`.
- **Seed rule (the design decision): a staple pins the match only
  when it fully covers the term ("good"); weak staple matches never
  pin.** The household's own data provided the counterexample that
  set the rule: they really buy "Oatly Havredryck Choklad 1,5%",
  which would otherwise turn a "havremjölk" list entry into
  chocolate oat milk. Pinned in tests (17 vitest cases now).
- Live effect (`--stores mathem`): "gul lök" now resolves to
  "Lök Gul Påse Klass1 Sverige — 15,50 kr ★ staple" (the bag the
  household buys) instead of search's single onion at 3,95 kr;
  havremjölk unchanged (iKaffe via relevance, still ⚠). Seeds are
  12h-cached like searches; seed-fetch failure degrades to unseeded
  matching with a warning, never sinks the store.
- Rotation need captured from Pelle same day ("ost" only from
  Willys/ICA; oats from Hemköp/Mathem/Willys — buy from one store one
  week, another the next): filed as
  [p5-02-store-rotation](p5-02-store-rotation.md) (per-item store
  affinity + rotation), depends_on p5-01.
- **Cross-store seed design**: seeds are store-native product lists
  from each store's own "what I usually buy" surface (Mathem
  likely_to_buy now; ICA "Återkommande"/favorites after the login
  tier; Axfood equivalents after accounts). Every store flows
  through the same pure `pickBest(term, products, seeds)` — no
  cross-store product-id mapping needed since seeding happens
  per-store after search. This is the wording proposed for the gate
  brief.

**2026-08-16 (Coop leg live — all five stores searchable):**

- Coop reverse-engineered anonymously (no account needed for the
  price leg): `POST external.api.coop.se/personalization/search/
  products?api-version=v1&store=251300&groups=CUSTOMER_PRIVATE&
  device=desktop&direct=true` with body `{query, resultsOptions:
  {skip, take}}` and header `Ocp-Apim-Subscription-Key` set to the
  site's **public** browser key (served to every visitor in
  `coopSettings.serviceAccess` in the page config — the same key for
  all; not a credential). Endpoint + params confirmed by watching the
  real browser's requests (coop.se network inspection); store 251300
  is the anonymous "Hemleverans i Stockholm" assortment. Prices are
  `salesPriceData.b2cPrice` (numbers), ids are EANs.
- **Coop's search auto-corrects "havremjölk" → "havremjöl"**
  (`queryUsed` in the response) and returns only oat flour — the
  third store to spring the oat trap, and the nastiest version since
  the correction happens server-side. Weak-flag guard catches it
  (pinned in tests; 19 vitest cases now). Possible follow-up:
  synonym expansion at search time ("havremjölk" → also try
  "havredryck") — noted for the implementation plan, not built in
  the spike.
- Live five-store run (`--zip 11251 --day 2026-08-18 --window
  17-20`): ICA 57,15 · Willys 69,10 · **Coop 73,38** · Mathem 76,07
  (with ★ staple gul lök) · Hemköp 102,95 — all 5/5 matched, Coop's
  havremjöl ⚠-flagged, delivery lines honest per store (Coop:
  needs-auth for slots, anonymous assortment noted).
- Coop fixture (5 terms × ≤8 trimmed real items) committed; Coop in
  the five-store fixture comparison test.
