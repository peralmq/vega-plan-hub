---
id: p5-02-store-rotation
title: Store rotation — per-item store affinity and week-to-week rotation
phase: P5
status: todo
depends_on: [p5-01-store-comparison-spike]
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

## Progress

- [ ] Affinity shape + rotation-state design (incl. persistence
      decision)
- [ ] Pure logic: affinity filtering, basket assembly, rotation
      suggestion (fixture-tested)
- [ ] CLI surfacing
- [ ] Evidence with real household affinity cases (ost, havregryn)

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

(none yet)
