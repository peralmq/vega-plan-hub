---
id: p5-02-store-rotation
title: Store rotation — per-item store affinity and week-to-week rotation
phase: P5
status: done
depends_on: [p5-01-store-comparison-spike, p5-03-fee-aware-totals]
---

## Goal

Some products the household wants are only carried (or only acceptable)
at a subset of stores — e.g. the "ost" they buy comes from Willys or
ICA only, oats from Hemköp, Mathem or Willys (Pelle 2026-08-16). A
single cheapest-basket winner therefore doesn't work week over week:
the planner should support **per-item store affinity** (this item may
only be bought at these stores) and **rotation** (buy from one eligible
store one week, another the next), so the household's real constraints
drive which store gets the order — not just price and slots.

Deliverable: affinity + rotation folded into the comparison output —
per-store baskets that respect item affinities, and a rotation
suggestion ("this week: Willys; last cheese run: ICA") the human can
override.

## Non-goals

- No checkout or payment automation, ever (p5-01 convention).
- No automatic multi-store order splitting in v1 — rotation picks a
  primary store per run; a split-basket view can be a follow-up.
- No new Supabase schema without the usual ask-first gate (rotation
  history needs persistence — where it lives is a design decision for
  this plan's first step).

## Context

- p5-01 built the comparison CLI (`compare/`): per-store matched
  baskets, prices, delivery-slot filter, Mathem cart-fill, and
  household-staple seeding (`pickBest(term, products, seeds)`).
- Affinity is the natural extension of the seed layer: seeds say "the
  household buys this exact product at this store"; affinity says
  "this list item may only be sourced from these stores".
- Rotation needs memory of past runs (which store got the last order
  for an affinity group) — the first deterministic design question of
  this plan.
- Depends on p5-03 (p5-01 gate decision 2026-08-16): rotation ranks
  eligible stores on the fee-aware comparable total, not item sum.

## Progress

- [x] Affinity shape + rotation-state design (incl. persistence
      decision): list entries `{name, stores: [...]}`; history =
      `compare/.rotation.json` (local gitignored file, bot/.env
      pattern — household run data stays on the M1, no Supabase
      schema so the ask-first gate never triggers); history written
      only on explicit `--record <store>` (suggestion is advisory,
      the human's actual order is what's remembered)
- [x] Pure logic: `src/lib/storeRotation.ts` — parseListEntries,
      allowedTerms (affinity gate), suggestPrimary (coverage →
      deliverability → rotate-away-from-last → fee-aware rank);
      11 vitest cases on the household's real affinity data
- [x] CLI surfacing: ✂ "not sourced here" per store (excluded terms
      never searched, never in totals; matched shown per-store), 🔁
      rotation line with reason + rotate-away detail, `--record`
      flag, rotation in `--json`
- [x] Evidence with real household affinity cases (ost, havregryn)
      — see Evidence, incl. a live week-over-week flip

## Steps

1. Design the affinity shape in the list format (e.g. list entries
   `{name, stores: ["willys", "ica"]}`) and how rotation state is
   recorded; decide persistence (file vs Supabase — ask-first if
   schema).
2. Extend the pure comparison logic: affinity-filtered matching,
   per-store basket assembly honoring affinities, rotation suggestion
   from recorded history. Fixture-tested in `./harness check`.
3. CLI surfacing: show which items each store may not supply, and the
   rotation recommendation with its reason.
4. Evidence with the household's real affinity cases (ost, havregryn).

## Verification

- `./harness check` passes; affinity + rotation logic fully
  fixture-tested (deterministic given list + history).
- A real household list with affinity entries produces correct
  per-store baskets and a rotation suggestion consistent with
  recorded history.

## Evidence

**2026-08-16 (implemented; test-first on the pure core):**

- `npx vitest run src/lib/storeRotation.test.ts` → 11 passed —
  parsing (incl. rejecting an empty affinity list as unbuyable),
  affinity gating, no-history pick (max coverage), tied-coverage
  week-over-week alternation (willys→ica→willys), rotate-away
  reporting, deliverability guard (rotation never suggests a store
  with no eligible slot when a deliverable one covers as much),
  rank tie-break, shop-separately (unsourced) listing.
- Live, real household cases (`fixtures/compare-list-affinity.json`:
  the 5-item list + ost [willys,ica] + havregryn
  [hemkop,mathem,willys]), zip 11251, 2026-08-18 window 17-20:
  "🔁 Rotation: this week WILLYS — covers 7/7 items" (only store
  allowed to supply both affinity items); per-store output shows
  e.g. Coop "✂ not sourced here (affinity): ost, havregryn" with a
  5-item basket, Mathem 6/6 with havregryn pinned to the
  household's real staple ("Garant Eko Havregryn ★ staple" via the
  p5-01 seed layer — affinity and seeding compose).
- **Live week-over-week flip** (ost-only affinity list, where
  willys and ica tie on coverage): `--record willys` →
  `.rotation.json` `{ost: {store: willys, date: 2026-08-16}}`;
  rerun → "🔁 Rotation: this week ICA — covers 6/6 items · rotates
  ost (last: willys 2026-08-16)". Demo state deleted afterwards
  (no real order was placed).
- `./harness check` → OK end to end (npm test 217 total; the
  compare tier is 50 cases across storeCompare + feeTotals +
  storeRotation + cache).
- Basket assembly honors affinity by construction: disallowed terms
  are never searched at a store (fewer live requests too), so they
  cannot enter its comparison, total, or cart plan.
