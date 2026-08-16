# Human Gate Brief — Store Comparison (p5-01)

Status: **gate passed 2026-08-16** — Pelle approved in chat ("Good,
continue"), same day as drafting. Outcomes, recorded per AGENTS.md in
the same change set (reversible only by Pelle at a future gate):

1. **tech.spec wording** — ✅ adopted as proposed in §3: "Store
   integrations" section added to tech.spec.md (adopted 2026-08-16).
2. **ICA login tier** — ✅ default taken: **anonymous search-only**;
   ICA slot times/fees stay "check at checkout", favorites/list-push
   not pursued.
   **Amended same day (Pelle in chat, 2026-08-16):** login tier
   **adopted** after all — plus purchase-history seeding for the
   stores where the household has history (ICA favorites/
   "Återkommande", Willys via the Axfood login). Filed as
   p5-04-ica-login-history-seeds; tech.spec updated in the same
   change set. Anonymous search stays the fallback.
3. **Follow-up scope** — ✅ p5-03-fee-aware-totals filed as proposed
   (§4, plus the adapter-drift check from §5); p5-02 store-rotation
   re-pointed to depend on it.

p5-01 closes with this gate (status: done).

## 1. What the spike proved (all live 2026-08-16, household data)

One real 5-item household list (`fixtures/compare-list.json`), zip
11251, delivery wanted 2026-08-18 in the 17–20 window:

| Store | Basket (5/5 matched) | Delivery in window | Slot fee |
| --- | --- | --- | --- |
| ICA (Maxi Lindhagen) | 57,15 kr | eligible by zip; times at checkout | unknown until checkout |
| Coop | 68,65 kr | 7 slots | 59–89 kr |
| Willys | 69,10 kr | 5 slots | 158 kr (99 delivery + 59 picking) |
| Mathem | 76,07 kr | 6 slots | 9–49 kr |
| Hemköp | 102,95 kr | 5 slots | 128 kr (79 + 49) |

- Integration paths: Mathem **official MCP** (OAuth + PKCE,
  self-registered client, refresh token stored, 21 tools, cart-fill
  verified in mathem.se checkout); Willys/Hemköp **authenticated
  Axfood REST** (login flow ported from Hellman's MIT willys-agent,
  current `v1/slot/homeDelivery` endpoint mined from site bundles);
  Coop **anonymous personalization API** (search + postcode/
  timewindows slots); ICA **anonymous v6 per-store search** behind
  AWS WAF (cache + pacing + `ICA_COOKIE` fallback) + anonymous
  store-eligibility-by-zip.
- Match quality is honest: weak matches are ⚠-flagged (Hemköp's
  "havremjöl" oat-flour trap caught; havredryck-vs-havremjölk legal
  naming handled), Mathem staples pinned via likely_to_buy seeds
  (★). Deterministic parts (matching, assembly, cache) are
  fixture-tested inside `./harness check`.
- **Read-only / cart-ready held everywhere**: no checkout, no slot
  booking, no payment; the only write anywhere is the opt-in Mathem
  cart-fill, reviewed in the shop's own UI.
- Credentials: `compare/.env` + `compare/.mathem-oauth.json`,
  gitignored, mode 600 — bot/.env pattern; nothing in repo or
  evidence text.

**Why fees must be first-class (Pelle's point, now confirmed in
data):** the cheapest basket (ICA 57,15) and dearest (Hemköp 102,95)
differ by ~46 kr — but slot fees span 9–158 kr, and even the two
Axfood siblings differ by 30 kr/slot on identical slots. Item-price
ranking without fee normalization picks the wrong store.

## 2. Decisions for Pelle

1. **Adopt the tech.spec boundary wording in §3** (store
   integrations become a spec-level contract) — approve/adjust.
2. **ICA login tier**: keep ICA anonymous-search-only (default;
   the 2024 API-crackdown precedent argues for caution), or opt in
   to a household-login tier (slot times + favorites/"Återkommande"
   + list push)? Default if no preference: stay anonymous.
3. **Follow-up implementation scope (§4)**: agree the fee-aware
   totals plan is filed as p5-03 and that p5-02 (rotation, already
   filed) builds on its comparable-total output — or reorder.

## 3. Proposed tech.spec wording (applied only on approval)

To be added under the tech.spec contract sections, alongside "Chat
assistant":

> ## Store integrations (adopted YYYY-MM-DD, p5-01 gate)
>
> Grocery-store integrations are **outbound calls from the adopted
> M1 household host only** — never from the web app, never from edge
> functions. Chains in scope: Mathem (official MCP, OAuth),
> Willys + Hemköp (authenticated Axfood REST), Coop (anonymous
> API), ICA (anonymous per-store search; login tier per the p5-01
> gate decision). Contract points:
>
> - **Cart-ready, never checkout**: integrations may search, read
>   delivery slots, and fill carts for human review in the store's
>   own UI. Checkout, slot booking, and payment always stay with
>   the human. This is a 🚫-never boundary.
> - **Credentials** live only on the M1 in gitignored mode-600
>   files (`compare/.env`, `compare/.mathem-oauth.json` — bot/.env
>   pattern); never in the repo, never echoed into evidence.
> - **Be a polite client**: read-only by default, cached (12h),
>   paced where a WAF asks for it; we never bypass bot-detection
>   challenges.
> - Deterministic logic (matching, basket assembly, fee/total
>   computation) lives in fixture-tested code under
>   `./harness check`; live network calls are evidence-only.

## 4. Proposed follow-up plan: p5-03 fee-aware totals

Scope (files as `p5-03` on approval; p5-02 rotation should depend on
it, since rotation compares stores on total cost):

- Normalize per-store **comparable totals**: basket + delivery fee +
  picking/packing + bag fees, per selected slot (fees vary per slot,
  proven on all of Coop/Mathem/Axfood).
- Model the two fee philosophies (fees-in-item-prices à la Mathem
  vs fees-at-checkout à la Axfood) so ranking is apples-to-apples;
  surface both "basket" and "basket + this slot" numbers.
- ICA fee data stays "unknown until checkout" unless decision 2
  opts into the login tier.
- Fixture-tested totals join `./harness check`; comparison output
  ranks on comparable total, not item sum.

## 5. Open items that stay honest, not blocking

- Hemköp "havremjölk → Havremjöl" is the standing weak-match
  example — ⚠ flag works; matching improvements ride along with
  p5-02's affinity work, not a gate item.
- Mathem slot-price variance between runs (dynamic pricing) is
  recorded in p5-01 evidence; totals must therefore be
  slot-specific (folded into §4 scope).
- Axfood endpoints moved once already (March → August); the
  self-improvement rule says adapter breakage should surface as a
  deterministic check where feasible — tracked in p5-03.
