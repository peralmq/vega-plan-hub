# compare/ — store-comparison CLI (p5-01)

Compares a shopping list across Mathem, Willys, Hemköp and ICA
(default store: Maxi ICA Stormarknad Lindhagen, account 1003418) on
price, match quality and delivery eligibility. Cart-ready only:
checkout, slot booking and payment always stay with the human.

```
npm run compare -- --list fixtures/compare-list.json --zip 11251 \
  [--stores mathem,willys,hemkop,ica] [--day 2026-08-20] [--window 17-20] [--json]
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
  included). The MCP also offers cart, lists, likely_to_buy (mapping
  seed) — wiring tracked in p5-01.
- Willys/Hemköp slot times need store logins (p5-01 step 2); their
  delivery line reports honestly what it can't know.
- Coop: pending household account (Hellman's coop-cli is the reference).

Endpoint provenance: docs/research/store-integration-landscape.md.
