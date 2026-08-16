# compare/ — store-comparison CLI (p5-01)

Compares a shopping list across Mathem, Willys, Hemköp and ICA
(default store: Maxi ICA Stormarknad Lindhagen, account 1003418) on
price, match quality and delivery eligibility. Cart-ready only:
checkout, slot booking and payment always stay with the human.

```
npm run compare -- --list fixtures/compare-list.json --zip 11251 \
  [--stores mathem,willys,hemkop,ica] [--day 2026-08-20] [--window 17-20] \
  [--fill-cart mathem] [--json]
```

- List file: JSON array of search terms or `{name}` objects.
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
- Willys/Hemköp slot times need store logins (p5-01 step 2); their
  delivery line reports honestly what it can't know.
- Coop: pending household account (Hellman's coop-cli is the reference).

Endpoint provenance: docs/research/store-integration-landscape.md.
