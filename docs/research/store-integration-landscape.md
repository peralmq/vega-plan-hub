# Store Integration Landscape — Mathem, Willys, ICA

Status: desk research, 2026-08-15. First half of the research spike the
back-burnered grocery-purchase integration requires (new backend
surface = ask-first per [AGENTS.md](../../AGENTS.md); no spec change or
code in this change set). Three parallel research agents; live endpoint
probes were performed 2026-08-15 where noted. Full per-store reports
were produced in-session; this doc is the durable synthesis.

## The question

Can Vega push a generated grocery list into a store's cart so the
household only reviews, picks a delivery slot, and pays? Sub-questions:
official APIs, cart-preview-before-purchase, home-delivery selection.

## Headline answers

- **Official public APIs: none, at any of the three.** No developer
  portals, no self-serve partner programs. All three run modern
  internal API platforms (Mathem/Oda: Django REST; Willys/Axfood: SAP
  Commerce Cloud v2; ICA: WSO2 gateway) — partnership is technically
  easy for them, but it is a business-development conversation, not a
  signup form.
- **"Preview cart before purchase" is the universally available flow.**
  Nobody exposes programmatic checkout worth touching anyway; the
  viable pattern everywhere is *pre-fill, then human review*: fill a
  cart (Mathem, Willys) or the in-app shopping list (ICA), and the
  user reviews, adjusts, picks delivery, and pays in the store's own
  UI. This matches Vega's ask-first/human-gate ethos exactly.
- **Home-delivery slot selection stays in the store checkout UI** in
  every practical flow. Willys has slot endpoints
  (`/axfood/rest/tms/delivery-slots?postalCode=`) but they require the
  user's login; Mathem has an internal
  `/delivery/ajax/delivery-availability/` endpoint (session-bound);
  ICA is store-specific with no current known endpoint. Since the user
  reviews the cart manually anyway, slot choice at checkout is a
  non-blocker.

## Per-store summary

### Mathem (mathem.se) — best effort/reward

Now fully on Norwegian **Oda's platform** (post-2024 merger); the Oda
web API applies with the base URL swapped.

- **Anonymous JSON search, live-verified**:
  `GET https://www.mathem.se/api/v1/search/?q=havremjolk` → id, name,
  brand, price, unit price, vegan/lactose classifiers, campaign data.
- **Cart API**: `GET /api/v1/cart/` works on an anonymous session
  (verified); `POST /api/v1/cart/items/` (Django CSRF + session
  cookies) adds items — the contract
  [gbbirkisson/mcp-oda](https://github.com/gbbirkisson/mcp-oda) uses
  on oda.com (actively maintained, pushed 2026-08-12; one Aug-2026
  breakage patched in days). Anonymous pre-fill then claim-at-login is
  plausible but merge behavior is unverified.
- **Recipe deep link**: recipe pages have "Lägg till i varukorgen"
  with per-ingredient product mapping, logged out — but no way to
  create recipes on their platform, and no shareable cart URL.
- **Auth**: email + password (no BankID). Adyen at checkout.
- **Posture: friendliest of the three.** No bot protection at all;
  robots.txt has an *explicit well-behaved-scraper policy* (identify
  with a bot UA + contact email, back off on 429/Retry-After). ToS has
  no scraping clause (content-copying restrictions only). Oda's own
  engineering org briefly published an "oda-mcp" agentic-shopping MCP
  server covering Mathem (now removed) — institutional openness to
  exactly this kind of integration. Active Adtraction affiliate
  program. Delivery: Stockholm/Gothenburg/Malmö corridors.

### Willys (willys.se) — most open endpoints, session-handoff problem

SAP Commerce Cloud (Hybris) with a custom `/axfood/rest/*` layer,
CloudFront-fronted, **no bot challenge** (plain curl works).

- **Anonymous search, live-verified**: `GET /search/clean?q=havremjölk`
  → `code` (SKU), price, compare-price, stock, promotions; CORS
  `access-control-allow-origin: *`. Loop54-powered relevance, handled
  generic terms well.
- **Anonymous cart-add, live-verified**: CSRF token from
  `/axfood/rest/csrf-token`, then `POST /axfood/rest/cart/addProducts`
  — worked without login. **But the cart lives in the `JSESSIONID`
  cookie**, not a URL: a server-built cart can't be handed to the
  user's browser. Practical shapes: browser-side calls in the user's
  own willys.se session, or holding the user's login server-side.
- **Login is deliberately non-trivial**: client-side AES-encrypted
  credentials (replicated in
  [ErikHellman/willys-agent](https://github.com/ErikHellman/willys-agent),
  pushed 2026-03) or Puppeteer
  ([jimmystridh/willys-mcp](https://github.com/jimmystridh/willys-mcp),
  19 tools incl. slots + checkout, pushed 2026-02). BankID offered as
  login alternative on the site.
- **Delivery**: hemleverans (59 kr picking + 99 kr delivery, major
  cities) / free pickup; slot endpoints exist but 404 without login.
- **ToS**: personal use only, "other use … not permitted without
  permission" — the sharpest wording of the three.

### ICA (ica.se) — hardest, but a clever list-tier shortcut

ICA killed its old semi-open `api.ica.se` in **April 2024** and told a
developer they "do not have an API, and if they did it wouldn't be
public." The community re-reverse-engineered the new
`apimgw-pub.ica.se` gateway.

- **Auth is the hard part**: OAuth against `ims.icagruppen.se` using
  the ICA app's embedded dynamic-client-registration secret —
  personnummer + password (no BankID needed, but ICA Banken customers
  are BankID-only and excluded). Clearly outside intended use.
- **Shopping-list tier (the sweet spot)**: with a user token, lists
  are fully scriptable (`shoppinglistservice/v1/shoppinglists`) and
  appear in the user's ICA app, which natively handles list → cart →
  delivery. Vega never touches checkout. Proven by
  [mar-schmidt/ica-cli](https://github.com/mar-schmidt/ica-cli)
  (pushed 2026-06) and
  [LazyTarget/ha-ica-todo](https://github.com/LazyTarget/ha-ica-todo)
  (pushed 2026-04).
- **Cart tier is fragile**: online shopping is per-store
  (`handlaprivatkund.ica.se/stores/{storeId}`), cart mutation needs a
  browser-session cookie + scraped CSRF (ica-cli does it via assisted
  Playwright login). WAF 403s non-browser UAs; ~5-min web token
  expiry.
- **Anonymous per-store product search works** (with a browser UA):
  `/stores/{storeId}/api/v5/products/search?term=…` → productId,
  price, availability, alternatives.
- **Prior art**: [handlingslista.se](https://www.handlingslista.se/)
  (inköpslista.ai) ships recipe-list → ICA-cart today, mechanism
  undisclosed — evidence of quiet tolerance, worth studying.
- Partnership routes: ICAx / ICA Växa innovation programs.

## Comparison

| | Mathem | Willys | ICA |
|---|---|---|---|
| Official API | ❌ | ❌ | ❌ (killed 2024) |
| Anonymous product search | ✅ verified | ✅ verified, CORS `*` | ✅ per-store, browser UA |
| Programmatic cart/list fill | ✅ cart (session) | ✅ cart, even anonymous (session) | ✅ shopping list (OAuth) / cart (fragile) |
| Cart preview before purchase | ✅ user checks out in UI | ✅ same | ✅ via ICA app from list |
| Delivery-slot via API | session-bound ajax | login-required endpoints | ❌ known |
| Login for full flow | email+password | pnr/email+password (AES) or BankID | pnr+password (app-secret OAuth) |
| Bot posture | explicitly bot-tolerant robots.txt | none observed | WAF + token churn |
| ToS risk | low | medium (personal-use clause) | medium-high (app-secret reuse) |
| Ecosystem freshness | mcp-oda pushed 2026-08 | two projects pushed 2026 Q1 | two projects pushed 2026 Q2 |

## Recommended path (proposal — gate decision is Pelle's)

1. **Tier 0, ship-safe now**: ingredient → product matching + price
   preview on the anonymous search APIs (all three; Mathem and Willys
   are trivial). No auth, low ToS risk, and it upgrades the existing
   Shopping Summary regardless of which store wins.
2. **Tier 1 prototype: Mathem cart pre-fill.** Friendliest posture
   (bot policy, no protection, no BankID, active reference
   implementation), household already fits the delivery area, and the
   flow ends in their UI for review + slot + payment. Identify the
   client per their robots.txt policy.
3. **Willys** second if price matters more than posture — anonymous
   cart-add is verified but the session handoff needs a browser-side
   component; **ICA** only via the shopping-list tier, opt-in, given
   credential-handling liability.
4. **In parallel**: Mathem/Oda partnership feeler (they built and
   shipped their own agentic-shopping MCP; Adtraction affiliate is
   live today) before investing beyond household scale.

Household-scale caveat: all unofficial paths mean handling the
household's store credentials on the M1 (bot/.env pattern, never in
repo) and accepting breakage risk — Willys/ICA ToS gray zones are
acceptable for personal use, not for a product.

## Open questions for the spike's second half (hands-on)

- Mathem: does an anonymous pre-filled cart merge into the account
  cart at login? (Decides whether Vega needs stored credentials at
  all.)
- Mathem: cart-add against a real account end-to-end incl. checkout
  preview (stop before payment).
- Willys: does CORS permit credentialed cart calls from another
  origin, or is an extension required?
- ICA: does the shopping-list tier survive contact with the current
  gateway using the household's account?
