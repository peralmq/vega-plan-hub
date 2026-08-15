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
- ICA: anonymous per-store search behind AWS WAF; on `bot-challenge`
  errors, set `ICA_COOKIE` (copy the cookie header from a browser visit
  to handlaprivatkund.ica.se). Store delivery eligibility per postal
  code is checked anonymously via handla.ica.se.
- Willys/Hemköp slot times need store logins; Mathem slots come with
  the official MCP OAuth (p5-01 steps 1–2). Until then the delivery
  line reports honestly what it can't know.
- Coop: pending household account (Hellman's coop-cli is the reference).

Endpoint provenance: docs/research/store-integration-landscape.md.
