---
id: p5-03-fee-aware-totals
title: Fee-aware totals — comparable basket+fees ranking across stores
phase: P5
status: todo
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

- [ ] Fee model design: per-store fee components, slot-specific
      totals, unknown-fee representation (ICA)
- [ ] Pure logic + fixtures: comparable-total computation in
      `./harness check` (per-slot fixture data from p5-01 evidence)
- [ ] CLI surfacing: "basket" and "basket + slot" columns; ranking
      switched to comparable total; ICA marked unknown
- [ ] Adapter-drift check (self-improvement rule, from p5-01 §5):
      a deterministic check that fails loudly when a store response
      no longer matches the committed shape (Axfood moved endpoints
      March→August once already)
- [ ] Live evidence: household list where fee-aware ranking differs
      from item-sum ranking

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

(none yet)
