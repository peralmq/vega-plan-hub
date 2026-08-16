---
id: p5-03-fee-aware-totals
title: Fee-aware totals — comparable basket+fees ranking across stores
phase: P5
status: done
depends_on: [p5-01-store-comparison-spike]
---

## Goal

Make the comparison rank stores on what the household actually pays.
Stores split the same money differently: Mathem bakes most fulfilment
cost into item prices (slots 9–49 kr), Axfood charges it per slot
(Willys 158 kr = 99 delivery + 59 picking; sibling Hemköp 128 = 79 +
49 on identical slots), Coop sits between (59–89 kr/window). p5-01
proved the fee spread can exceed the entire basket-price gap, so
item-sum ranking picks the wrong store (requirement from Pelle
2026-08-16; adopted at the p5-01 gate).

Deliverable: per-store **comparable totals** — basket + delivery +
picking/packing + bag fees for a concrete slot — surfaced as both
"basket" and "basket + this slot" numbers, with ranking on the
comparable total.

## Non-goals

- No checkout or payment automation, ever (tech.spec store-
  integrations boundary).
- No ICA fee retrieval: ICA has no login tier (p5-01 gate decision);
  its total stays honestly "basket + fees unknown until checkout".
- No new Supabase schema; this is CLI/compare-layer work.

## Context

- p5-01 evidence (docs/research/p5-store-comparison-gate-brief.md §1):
  live per-slot fee splits for Axfood (`totalCost = deliveryCost +
  pickingCost`), Coop window prices, Mathem slot prices; Mathem also
  showed run-to-run slot-price variance (dynamic pricing), so totals
  must be slot-specific, not store-constant.
- Fee philosophies to model: fees-in-item-prices (Mathem) vs
  fees-at-checkout (Axfood/Coop). The comparable total makes these
  apples-to-apples; bag/packing fees beyond the slot fee (if any
  surface per store) join the model as they are discovered.
- p5-02 (store rotation) depends on this plan: rotation ranks
  eligible stores on comparable total, not item sum.

## Progress

- [x] Fee model design: per-store fee components, slot-specific
      totals, unknown-fee representation (ICA) —
      `src/lib/feeTotals.ts` (FeeSlot / DeliveryFees:
      slots|unknown|none, rankByComparable)
- [x] Pure logic + fixtures: comparable-total computation in
      `./harness check` (17 vitest cases over real slot captures in
      `src/lib/__fixtures__/store-slots/`, 2026-08-16, zip 11251)
- [x] CLI surfacing: header shows both numbers ("basket X · with
      delivery Y (cheapest slot Z varav plock W)"); ranking on
      comparable total; ICA "fees unknown (checkout)"; JSON output
      gains a `ranking` array
- [x] Adapter-drift check: validate* shape validators run on every
      live slot response (compare/axfood.ts, stores.ts, cli.ts
      Mathem path) and against committed fixtures in the gate;
      failure names the moved field
- [x] Live evidence: ranking flip recorded (Mathem 4th→1st among
      fee-known stores; see Evidence)

## Steps

1. Design the fee model: components (delivery, picking, bags),
   slot-specificity, and how "unknown" (ICA) renders without
   pretending comparability.
2. Implement as pure logic with committed fixtures (real p5-01
   response shapes) in `./harness check`.
3. Surface in the CLI: both numbers per store, rank on comparable
   total, keep the per-slot "varav plock" detail.
4. Add the adapter-drift check: store adapters validate live
   responses against the fixture schema and fail with a clear
   "shape moved" message.
5. Live evidence run; record a case where the ranking flips.

## Verification

- `./harness check` passes; comparable-total logic fully
  fixture-tested, adapter-drift check in the gate.
- A live run shows fee-aware ranking (with at least one store where
  it differs from item-sum order) and ICA rendered as
  unknown-until-checkout.
- No credential material in repo or evidence.

## Evidence

**2026-08-16 (implemented in one pass, test-first):**

- Fixtures captured live (read-only): Axfood
  `v1/slot/homeDelivery` via household logins (willys 79 slots,
  hemkop 90 — kept 6 each), Coop anonymous timewindows (76 kept 6),
  Mathem MCP `get_delivery_slots` for 2026-08-18 (19 kept 6) →
  `src/lib/__fixtures__/store-slots/*.json`. Scanned for
  credential material: clean.
- Red→green: `npx vitest run src/lib/feeTotals.test.ts` failed
  (module absent), then `17 passed (17)` — parseSek's three store
  spellings ("39 kr", "89:-", "158,00 kr"), Axfood delivery+picking
  split summing to total, intra-Axfood Hemköp<Willys fee gap, drift
  validators accepting all fixtures and naming mutated/re-typed
  fields, ranking flip and no-slot-ranks-last.
- `./harness check` → OK end to end (lint 0 errors / 9
  grandfathered warnings untouched, npm test incl. the new 17,
  build, tsc bot+compare, 21 plans, 30 recipes).
- **Live ranking flip** (`npm run compare -- --list
  fixtures/compare-list.json --zip 11251 --day 2026-08-18
  --window 17-20`):

  ```
  💰 Ranked on basket + cheapest eligible slot fee where fees are known
  ICA — basket 57,15 kr + delivery fees unknown (ICA fees shown at checkout)
  MATHEM — basket 76,07 kr · with delivery 85,07 kr (cheapest slot 9 kr)
  COOP — basket 68,65 kr · with delivery 127,65 kr (cheapest slot 59 kr)
  WILLYS — basket 69,10 kr · with delivery 227,10 kr (cheapest slot 158 kr varav plock 59)
  HEMKOP — basket 102,95 kr · with delivery 230,95 kr (cheapest slot 128 kr varav plock 49)
  ```

  Item-sum order was ICA·Coop·Willys·Mathem·Hemköp — Mathem's 9 kr
  slot beats Coop and Willys despite the dearest fee-known basket;
  Willys' 2nd-cheapest basket drops to 4th under its 158 kr slot
  fee. Exactly the wrong-store pick the p5-01 gate flagged, now
  visible and corrected in the output.
- Bag/packing fees beyond the slot fee: none surfaced anywhere in
  the slot responses (Axfood's split is delivery+picking, summing
  to total; Coop/Mathem publish flat window prices). If a store
  later adds one, it lands in FeeSlot alongside delivery/picking.
- Mathem slot-price variance note (p5-01) honored by design: fees
  come from the same response as the run's slots — nothing cached
  across runs, totals are slot-specific.
