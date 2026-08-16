---
id: p5-04-ica-login-history-seeds
title: ICA login tier + purchase-history seeding (ICA favorites, Axfood history)
phase: P5
status: in-progress
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

- [ ] Axfood history seeds: endpoint mined, adapter + extraction,
      wired into the comparison for willys/hemkop with drift
      validation and fixture tests
- [ ] ICA login flow reverse-engineered and implemented (or the
      honest blocker recorded: exact flow, where it stops, and the
      fallback)
- [ ] ICA seeds: favorites/"Återkommande" mapped into StoreProduct
      seeds behind the login
- [ ] ICA slot tier: ecomslots v2 retried with a session; fees wired
      via the p5-03 model, or "times at checkout" kept honestly
- [ ] Fixtures + `./harness check` green; README/env skeleton
      updated
- [ ] Live evidence with household ICA credentials (human step:
      Pelle fills the ICA keys in compare/.env)

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

(running log below)
