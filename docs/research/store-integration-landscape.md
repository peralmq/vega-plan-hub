# Store Integration Landscape — Mathem, Willys, ICA

Status: desk research, 2026-08-15 (round 2 addendum same day). First
half of the research spike the back-burnered grocery-purchase
integration requires (new backend surface = ask-first per
[AGENTS.md](../../AGENTS.md); no spec change or code in this change
set). Round 1: three parallel research agents, one per store. Round 2:
a GitHub ecosystem sweep (authenticated `gh` search incl. code search)
plus an X.com/social sweep. Live endpoint probes were performed
2026-08-15 where noted. Full per-agent reports were produced
in-session; this doc is the durable synthesis.

## The question

Can Vega push a generated grocery list into a store's cart so the
household only reviews, picks a delivery slot, and pays? Sub-questions:
official APIs, cart-preview-before-purchase, home-delivery selection.

## Headline answers

- **Official public APIs: none at Willys or ICA — but Mathem/Oda
  shipped an OFFICIAL MCP server ~2026-08-07.** (Round-2 correction
  to round 1's "none anywhere".) `https://www.mathem.se/mcp` is live:
  OAuth-protected (401 + `.well-known/oauth-protected-resource/mcp`
  metadata, authorization server `https://www.mathem.se/o`, scope
  `mcp`) — verified first-hand 2026-08-15. Announced on LinkedIn by
  Oda engineers ("For everyone who asked, it's here — Oda MCP"),
  explicitly built because of community demand; same endpoint live on
  oda.com. Mathem is now the only Swedish grocer with *sanctioned*
  agentic shopping access. Willys/ICA remain: no developer portals,
  no self-serve partner programs, modern internal API platforms
  (Axfood: SAP Commerce Cloud v2; ICA: WSO2 gateway) — partnership
  there is a business-development conversation, not a signup form.
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
| Official API | ✅ **MCP, Aug 2026** | ❌ | ❌ (killed 2024) |
| Anonymous product search | ✅ verified | ✅ verified, CORS `*` | ✅ per-store, browser UA |
| Programmatic cart/list fill | ✅ cart (session) | ✅ cart, even anonymous (session) | ✅ shopping list (OAuth) / cart (fragile) |
| Cart preview before purchase | ✅ user checks out in UI | ✅ same | ✅ via ICA app from list |
| Delivery-slot via API | session-bound ajax | login-required endpoints | ❌ known |
| Login for full flow | email+password | pnr/email+password (AES) or BankID | pnr+password (app-secret OAuth) |
| Bot posture | explicitly bot-tolerant robots.txt | none observed | WAF + token churn |
| ToS risk | low | medium (personal-use clause) | medium-high (app-secret reuse) |
| Ecosystem freshness | mcp-oda pushed 2026-08 | two projects pushed 2026 Q1 | two projects pushed 2026 Q2 |

## Round 2: community ecosystem (GitHub + social sweep, 2026-08-15)

The scene is bigger and fresher than round 1 found — at least **nine
grocery MCP servers** for the Swedish market, nearly all created
2025-10 → 2026-07, plus CLI suites and Home Assistant coverage of all
three ecosystems. Cross-cutting patterns:

- **"Cart-ready, never checkout" is the community's safety
  convention** — stated explicitly by the two most polished projects
  ("Veckomenyn stops at cart-ready. Delivery and payment stay where
  they belong."). Matches Vega's human-gate ethos and round 1's flow
  conclusion.
- **MCP is the integration surface of the moment**; no browser
  extensions surfaced at all — the community builds CLIs, MCP
  servers, HA integrations, and self-hosted web apps.
- **Two prolific Swedish authors each built a whole suite**: Erik
  Hellman ([willys-agent](https://github.com/ErikHellman/willys-agent),
  [hemkop-cli](https://github.com/ErikHellman/hemkop-cli), coop-cli,
  [food-shopping-agent](https://github.com/ErikHellman/food-shopping-agent)
  — an agent that price-compares Hemköp/Willys/Coop and fills the
  cheapest cart — and
  [dinner-planner-assistant](https://github.com/ErikHellman/dinner-planner-assistant),
  a Swedish-language chat agent that fills the Willys cart, pushed
  2026-08-11) and Simon Nordberg
  ([veckomenyn](https://github.com/simonnordberg/veckomenyn), a
  self-hosted family meal planner with pluggable LLM + store
  backends, 6 stars, pushed 2026-07-22, plus
  [willys-cli](https://github.com/simonnordberg/willys-cli)).
  Veckomenyn is the closest existing thing to Vega's store ambition —
  study before building.

Standout new finds per store (beyond round 1's inventory):

- **Mathem**: [marcusforsberg/ha-mathem](https://github.com/marcusforsberg/ha-mathem)
  (Home Assistant, 2026-07/08: search, *diet-aware cart* with
  allergen fail-closed mode, **delivery-slot selection**, Swedish
  voice control — proof the slot ajax works with a session),
  [Corpra/mathem-cli](https://github.com/Corpra/mathem-cli) (npm,
  anonymous search + cookie-session cart),
  [dinorastoder/oda-agent-kit](https://github.com/dinorastoder/oda-agent-kit)
  (TS monorepo: core client, CLI, MCP server, delivery slots).
  Historical: Kolonial.no (Oda's ancestor) once had an *official*
  API (python-kolonial etc., dead) — official access is a
  return-to-form for them, now realized as the official MCP.
- **Willys/Axfood**: earliest modern agent is
  [elitan/willys-agent-meal-planner](https://github.com/elitan/willys-agent-meal-planner)
  (2025-06, by Nhost founder Johan Eliasson, publicized on LinkedIn,
  ships a reverse-engineered `WILLYS_API.md`). The Axfood
  `axfood/rest` shape extends to Hemköp (hemkop-cli + two 2026
  clones).
- **ICA**: [kanylbullen/ica-mcp](https://github.com/kanylbullen/ica-mcp)
  (2026-07, ~20 tools: lists, recipes, offers-on-my-list matching,
  Stammis balance, EAN lookup; personnummer+password, no BankID),
  [cheif/ica-caldav](https://github.com/cheif/ica-caldav) (CalDAV
  bridge → ICA lists via Siri/Apple Reminders, **BankID login flow**,
  maintained since 2024),
  [JMrtzsn/Matkorgen](https://github.com/JMrtzsn/Matkorgen)
  (Playwright-driven ICA MCP). A 2026-02 attempt to revive the old
  HA integration shows demand persists post-crackdown.
- **Cross-store**: [Kronixion/matval](https://github.com/Kronixion/matval)
  (MCP scraping ICA/Coop/Willys/Hemköp/Mathem: meal plans from
  nutritional requirements, price history),
  [Armandur/fyndkartan](https://github.com/Armandur/fyndkartan)
  (unified FastAPI over six chains' stores + weekly offers, pushed
  2026-08-07). matspar.se: no community integrations exist; offer
  data comes via ereklamblad.se / matpriskollen.se scrapers instead.

X.com specifically: near-empty — X blocks anonymous indexing, so
recent hobbyist posts are unfindable from outside. The one verified
store interaction is from 2015 (@Mathem replying "not at the moment,
but I'll check with IT" to an API request — eleven years before they
shipped the MCP). The real announcement channels for this scene are
GitHub and LinkedIn (both the Oda MCP launch and Eliasson's Willys
write-up were LinkedIn posts).

Tolerance signals, updated: **Mathem** went from "no API" (2015) to an
official MCP (2026) — the strongest possible signal. **Willys**:
silent tolerance; three MCP/agent projects and commercial scrapers
operate openly, no blocking observed, but all carry "unofficial, use
responsibly" disclaimers. **ICA**: one real crackdown (Apr 2024 API
shutdown) and the community rebuilt anyway; no action against the
rebuilt projects observed.

## Recommended path (proposal — gate decision is Pelle's)

1. **Tier 1 (was: prototype; now: the headline): the official Mathem
   MCP.** Sanctioned, OAuth-based (no stored passwords), MCP is
   exactly the shape Vega's M1 agent runtime consumes, and the flow
   presumably ends in Mathem's UI for review + slot + payment. The
   hands-on spike should start here: complete the OAuth flow against
   `https://www.mathem.se/o`, enumerate the MCP's tools, and test
   list → cart end-to-end with the household account.
2. **Tier 0, ship-safe regardless**: ingredient → product matching +
   price preview on the anonymous search APIs (all three; Mathem and
   Willys are trivial). No auth, low ToS risk, upgrades the existing
   Shopping Summary whichever store wins.
3. **Willys** as price-motivated fallback — anonymous cart-add is
   verified but unsanctioned, and the session handoff needs a
   browser-side component; **ICA** only via the shopping-list tier,
   opt-in, given credential-handling liability and their 2024
   crackdown precedent.
4. **Study before building**: veckomenyn (simonnordberg) — a working
   family meal-planner → Willys-cart agent with pluggable store
   backends — and ha-mathem's diet-aware cart + slot handling.
   Adtraction affiliate remains available for revenue-neutral
   linking.

Household-scale caveat: all unofficial paths mean handling the
household's store credentials on the M1 (bot/.env pattern, never in
repo) and accepting breakage risk — Willys/ICA ToS gray zones are
acceptable for personal use, not for a product.

## Round 3 addendum (2026-08-16): direction set, key facts verified

Pelle's gate direction: **use the official Mathem MCP, plus Erik
Hellman's CLI suite for multi-chain price comparison, with a
"can they deliver day X around time Y" filter** on an assembled
shopping list. Hands-on facts verified same day:

- Mathem's AS metadata (`/o/.well-known/oauth-authorization-server`):
  **dynamic client registration supported** (`/o/register/`),
  authorization-code + PKCE S256, refresh tokens, scope `mcp`, token
  auth `none` — self-registered clients work, no partnership needed.
- Hellman's willys-agent / hemkop-cli / coop-cli /
  food-shopping-agent: all **MIT**, last pushed 2026-03-28. Coverage
  is search + cart add/clear only — **no delivery-slot support
  anywhere in the suite** (only static delivery-cost metadata); the
  slot filter is new work (Axfood reference: jimmystridh/willys-mcp).

Spike plan: [p5-01-store-comparison-spike](../execplans/p5-01-store-comparison-spike.md)
(P5, depends on p4-02).

## Open questions for the spike's second half (hands-on)

- **Mathem MCP (new, first priority)**: what tools does the official
  server expose (search? cart? lists? slots?), does OAuth client
  registration work for a hobby client (dynamic registration or
  manual?), and does an MCP-filled cart show up for review in the
  normal mathem.se checkout?
- Mathem (fallback only if the MCP is too limited): does an anonymous
  pre-filled cart merge into the account cart at login?
- Mathem: cart-add against a real account end-to-end incl. checkout
  preview (stop before payment).
- Willys: does CORS permit credentialed cart calls from another
  origin, or is an extension required?
- ICA: does the shopping-list tier survive contact with the current
  gateway using the household's account?
