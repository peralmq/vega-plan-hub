# compare/ — store-comparison CLI (p5-01)

Compares a shopping list across Mathem, Willys, Hemköp, ICA (default
store: Maxi ICA Stormarknad Lindhagen, account 1003418) and Coop on
price, match quality and delivery eligibility. Cart-ready only:
checkout, slot booking and payment always stay with the human.

```
npm run compare -- --list fixtures/compare-list.json --zip 11251 \
  [--stores mathem,willys,hemkop,ica,coop] [--day 2026-08-20] [--window 17-20] \
  [--fill-cart mathem] [--json]
```

- List file: JSON array of search terms or `{name}` objects. A
  `{name, stores: ["willys", "ica"]}` entry is a **store affinity**
  (p5-02): that item is only sourced at those stores — other stores
  never search it (shown as "✂ not sourced here") and their totals
  exclude it.
- **Rotation** (p5-02): the 🔁 line suggests this run's primary store —
  best affinity coverage, then deliverability, then rotating away from
  the store that got the last order (per-item history), then the
  fee-aware rank. Advisory only: after actually ordering, run
  `--record <store>` to update the per-item history
  (`compare/.rotation.json`, local + gitignored — household run data
  stays on the M1).
- Ranking is fee-aware (p5-03): stores are ordered on **basket +
  cheapest eligible slot fee** where fees are known (Mathem/Coop/
  Willys/Hemköp per-slot; the header shows both numbers), on basket
  alone where a store hides fees until checkout (ICA — flagged
  "fees unknown"), and last when no slot matches the day/window.
  Slot responses are shape-validated on every call
  (`src/lib/feeTotals.ts`) so an API move fails loudly, never as a
  silent 0-kr fee.
- Matching/assembly logic: `src/lib/storeCompare.ts` (fixture-tested in
  `./harness check`); this directory is network I/O + output only.
- `⚠ weak` = the store's top hit didn't fully cover the term (e.g.
  plant milk is legally "havredryck") — review before trusting totals.
- ICA: anonymous per-store search behind AWS WAF. Mitigations (in
  order): 12h result cache (`compare/.cache/`, gitignored), ~2s
  jittered pacing for ICA requests, one 15s-backoff retry on a
  challenge. We never solve the challenge itself. Last resort: set
  `ICA_COOKIE` (copy the cookie header from a browser visit to
  handlaprivatkund.ica.se). Store delivery eligibility per postal
  code is checked anonymously via handla.ica.se.
- **Seeds** (★ staple): household staples pin fully-covering matches —
  Mathem via order history (get_orders) merged with likely_to_buy
  (history first), Willys/Hemköp via order history (p5-04; last ~5
  orders' lines, most-frequently-bought first, priced from today's
  search when available). Weak seeds never pin.
- **ICA login tier** (p5-04, live): `ICA_PERSONNUMMER` +
  `ICA_PASSWORD` in `compare/.env` (ims.icagruppen.se "Lösenord"
  authenticator; a BankID-only account must first set a password at
  ica.se). The session persists in `compare/.ica-session.json`
  (mode 600, gitignored) so runs reuse cookies instead of
  re-logging in. With auth, "Dina favoriter" seeds ★ staples for
  ICA — and keeps terms matching even when the WAF challenges a
  live search. Anonymous search stays the fallback without keys;
  ICA slot times remain at checkout (`npm run ica-probe` re-checks
  the endpoint map).
- Mathem: `npm run mathem-auth` runs the one-time OAuth (PKCE,
  loopback callback) against the **official Mathem MCP**; tokens in
  `compare/.mathem-oauth.json` (gitignored, mode 600, auto-refresh).
  With auth, `--day`/`--window` filter real bookable slots (prices
  included), and `--fill-cart mathem` pushes the matched basket into
  the household cart (additive — one unit per term; re-running adds
  again) and prints the cart URL for review. Weak matches go in
  flagged; unmatched terms are listed as manual. The printed cart
  total includes Mathem's fees on top of the item sum. Checkout, slot
  booking and payment always stay with the human. With auth the
  matcher is also seeded from `likely_to_buy` (the household's ~50
  staples): a staple that fully covers a term pins over search
  relevance (shown as `★ staple`); weak staple matches never pin —
  the household buying chocolate oat drink must not hijack a
  "havremjölk" list entry.
- Willys/Hemköp slot tier: put chain credentials in gitignored
  `compare/.env` (mode 600) as `WILLYS_USERNAME`/`WILLYS_PASSWORD`
  and `HEMKOP_USERNAME`/`HEMKOP_PASSWORD`; the CLI then logs in
  (Hellman's MIT willys-agent flow) and filters real
  `tms/delivery-slots` — read-only, no booking. Without credentials
  the delivery line reports honestly what it can't know.
- Prices are item prices only and fee models differ per store (some
  bake delivery into prices, others add delivery/bag/packing fees at
  checkout — Pelle 2026-08-16): Mathem's cart line prints items vs
  cart-total-incl-fees, Coop/Willys/Hemköp slot lines include the
  slot fee. Full fee normalization is implementation-plan scope.
- Coop: anonymous search via the personalization API
  (`external.api.coop.se`) using the site's public browser
  subscription key (served to every visitor in the page config — not
  a credential) against the default anonymous "Hemleverans i
  Stockholm" assortment (store 251300). Beware: Coop's search
  auto-corrects "havremjölk" → "havremjöl" (oat flour) — the ⚠ weak
  flag catches it — and results are session-personalized, so reruns
  can differ. **Coop slot times are anonymous too**
  (`/ecommerce/coop/users/anonymous/postcode/{zip}/timewindows`), so
  `--day`/`--window` filter real Coop slots with zero credentials.

Endpoint provenance: docs/research/store-integration-landscape.md.
