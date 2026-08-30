---
id: p5-08-shopping-list-editing
title: Shopping-list edits that stick — removals survive reconcile, ad-hoc items reach the shop run
phase: P5
status: todo
depends_on: [p4-03-planning-conversation, p5-05-batch-compare-handoff]
---

## Goal

Directive from Pelle (2026-08-30, in chat): "Jag vill kunna ta bort från
shoppinglistan.. och lägga till annat. för oftast har vi många av
basvarorna hemma redan. och vi behöver lägga till andra varor som inte
är en del av middagarnas behov."

Both verbs already exist in chat (`köp X` → add, `ta bort X` → remove,
p4-02/p4-03) — but neither sticks end-to-end. Close the two gaps so the
list the household edits is the list the shop run fills:

1. **Removals survive regeneration.** `remove_items` hard-deletes the
   row (bot/tools.ts), and `reconcileShoppingItems` re-inserts any
   generated item with no matching row (src/lib/planShopping.ts) — so a
   pruned staple ("har hemma") comes back on the next pool change or
   reconcile. Extend the trust promise: regeneration may never lose what
   the household ticked off, *and may never resurrect what it removed*.
2. **Ad-hoc adds reach the shop run.** Bot inserts write `source:
   "adhoc"` with **no batch_id** — the adopted gate call is "ad-hoc
   items batchless until shopping mode gathers them" (tech.spec P4
   contract) and product.spec promises "one aggregated list per locked
   batch **plus ad-hoc items**". But `fetchBatchRows`
   (compare/batchFetch.ts) selects `.eq("batch_id", batchId)` only, so
   `--batch` compare and every `--fill-cart` never see them: shopping
   mode never gathers. Union in the unchecked batchless rows.

## Non-goals

- No web-page editing UI. ShoppingSummary.tsx stays derived-only this
  plan (its local-only checkboxes and missing ad-hoc rows are a known
  adjacent gap vs product.spec's "check-off shared live" — separate
  plan if wanted). Chat remains the editing surface.
- Not the app-swap staleness bug (web swaps don't regenerate the locked
  batch's rows) — already filed separately (p5-06 evidence 2026-08-30).
- No matcher/term-normalization work (p5-06 residual, separate).
- Quantities on ad-hoc rows stay as captured; no unit aggregation
  between ad-hoc and recipe rows (they are distinct rows by design).

## Context

- **Schema delta required — ask-first per AGENTS.md.** Durable removal
  needs a tombstone the reconcile can see. Proposal, mirroring the
  checked pair: `removed_at timestamptz null` + `removed_by uuid null
  → family_members` on `shopping_list_items`. This is a change to the
  approved §1 set and must be confirmed at this plan's dispatch gate
  (same procedure as the p4-12 `meal_date` delta); tech.spec's schema
  wording is amended in the same change set once confirmed.
- Removal semantics: `remove_items` on a `source='recipe'` row sets
  `removed_at`/`removed_by` (tombstone); on an `adhoc` row a hard
  delete stays correct (nothing regenerates it).
- Reconcile semantics (planShopping.ts): a generated item whose
  identity matches a removed row → keep the tombstone, no insert, no
  quantity update; an unmatched, unchecked, removed row → safe to
  delete (tombstone no longer needed). Checked rows keep today's
  behavior exactly.
- **Gathering must be read-side only.** Do NOT stamp `batch_id` onto
  ad-hoc rows at shop time: `afterPoolChange` reconciles
  `loadBatchItems(batchId)` and would then DELETE every unmatched
  ad-hoc row on the next swap. Defensive hardening in the same change:
  scope reconcile's `existing` to `source='recipe'` so an ad-hoc row
  can never be reconcile-deleted even if it someday carries a batch_id.
- Every list surface must exclude removed rows: bot `show_list` +
  `findUnchecked` (bot/tools.ts), compare `batchRowsToCompareList`
  (already filters checked; add removed), menu-card item count feed,
  SEK estimate input.
- Re-add after removal ("köp mjölk" when mjölk is tombstoned): prefer
  clearing `removed_at` on the matching canonical row over inserting a
  duplicate adhoc row; if that's fiddly at add-time, a lingering
  tombstone next to a fresh adhoc row is harmless (list shows the item
  once) — decide in implementation, test either way.
- Coordination: p5-07 (in flight) is editing compare/cli.ts,
  compare/axfood.ts, src/lib/storeCompare.ts. This plan's compare-side
  touch is compare/batchFetch.ts + compare/batchMap.ts — small overlap
  surface, but rebase after p5-07 lands.

## Progress

- [ ] Dispatch gate: schema delta (`removed_at`/`removed_by`) confirmed
      by Pelle; migration applied; tech.spec §schema amended.
- [ ] `reconcileShoppingItems`: tombstone-aware (tests: removed row not
      re-inserted across a swap; removed+unmatched row cleaned up;
      checked behavior unchanged; existing scoped to source='recipe').
- [ ] Bot `remove_items` → tombstone for recipe rows, delete for adhoc;
      `findUnchecked`/`show_list` exclude removed.
- [ ] compare `--batch`: unchecked batchless ad-hoc rows unioned into
      the list (fixture test in batchMap/batchFetch); flows through
      `--fill-cart` untouched downstream.
- [ ] `./harness check` green; commit; live verification (see below).

## Steps

1. Dispatch-gate the schema delta; write the Supabase migration +
   regenerate `src/integrations/supabase/types.ts`; amend tech.spec in
   the same change set.
2. Test-first on `reconcileShoppingItems` (pure, fixture-friendly):
   the resurrect case from live history — reconcile after a removal —
   must fail red before the tombstone lands.
3. Bot verbs: `remove_items` tombstone path + surface exclusions;
   re-add behavior decided + tested.
4. compare/batchFetch union + batchMap exclusion of removed; fixture
   test with a mixed recipe/adhoc/checked/removed row set.
5. `./harness check`, commit, handoff.

## Verification

- `./harness check` passes.
- Unit: reconcile tombstone tests (planShopping.test.ts), batchMap
  mixed-row fixture test.
- Live script: in chat `ta bort salt` then swap a meal → salt does NOT
  return in the diff or on the list; `köp diskmedel` then
  `npm run compare -- --batch latest` → diskmedel appears in the
  compare list and lands in the filled cart.

## Evidence

(pending)
