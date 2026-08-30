---
id: p5-09-web-shopping-list-editing
title: Web shopping list goes live — /summary reads/writes shopping_list_items (shared check-off, remove, add)
phase: P5
status: todo
depends_on: [p5-08-shopping-list-editing]
---

## Goal

Directive from Pelle (2026-08-30, in chat, follow-up to p5-08): "Nu
pratade jag även om shoppinglistan i webappen.. där ska man kunna göra
det med.." — remove and add on the web too, not only in chat.

Today ShoppingSummary.tsx is derived-only: it recomputes the list from
the batch pool (`aggregateBatchIngredients`) and its checkboxes are
component-local state — nothing persists, ad-hoc rows are invisible,
and product.spec's "check-off shared live between partners" promise is
unmet on the web. Rebuild `/summary` on the persisted list:

1. Read `shopping_list_items` (active batch's rows + unchecked
   batchless ad-hoc rows), excluding removed tombstones — the same
   query surface the bot and compare use, so all three show one list.
2. Check-off writes `checked_at`/`checked_by` and is shared live
   between partners (and with chat's `bocka av`).
3. Remove uses the p5-08 tombstone semantics (recipe rows →
   `removed_at`, adhoc rows → delete) so a web removal survives
   reconcile exactly like a chat removal.
4. Add: a small input inserts `source='adhoc'` rows (preference
   resolution at add-time, same as the bot's insert path).

## Non-goals

- No store comparison / prices / cart-fill in the web (P5 CLI stays
  the shop-run surface).
- No quantity editing on rows in v1 (chat `correct_last` covers
  fixes; revisit on live feedback).
- Not the app-swap staleness bug (web swaps don't regenerate the
  locked batch's rows — filed separately per p5-06 evidence
  2026-08-30). Note the interplay: once the web *shows* the persisted
  rows, that staleness becomes visible to the household, so that fix
  rises in priority.
- Print and copy-to-clipboard stay, now fed from the persisted list.

## Context

- Depends on p5-08 for the tombstone schema (`removed_at`/
  `removed_by`) and its exclusion rules — the web must never
  hard-delete a recipe row (reconcile would resurrect it).
- New hook (e.g. `useShoppingList`) beside useBatchPool/
  useProductPreferences; live sharing via Supabase realtime
  subscription on `shopping_list_items`, or refetch-on-focus if
  realtime is fiddly — "shared live" is the contract, mechanism is the
  implementer's call.
- Batch rows exist only for batches locked via the bot pipeline. If a
  locked batch has no rows (pre-p4-03 history), fall back to the
  current derived view read-only with a hint — don't silently write a
  parallel list.
- No active batch ≠ empty page anymore: the batchless ad-hoc list
  still renders and is editable (that IS the "andra varor" list).
- Attribution: `checked_by`/`added_by`/`removed_by` are nullable;
  the web session is the shared household user with no family-member
  identity. Write null in v1 (useFamilyMembers + a member picker is a
  possible follow-up; don't block on it).
- Mock mode (p2-02): seed `shopping_list_items` rows in
  src/mocks/seedData.ts (mixed recipe/adhoc/checked) so mockClient
  serves the page and e2e can drive check/remove/add
  deterministically.
- Spec-first: design.spec's Shopping Summary row (aggregated derived
  list, local checkboxes) is amended in the same change set to the
  persisted shared list + editing; product.spec needs no change (this
  plan *meets* its existing promise).
- Conventions: playful spirit is a product requirement — keep the
  emoji confirmations (✅ on check, 🗑️ on remove, 🛒 on add),
  design tokens, and the uncluttered print view.

## Progress

- [ ] `useShoppingList` hook (fetch + realtime/refetch, mutations:
      check, uncheck, remove, add) with mock-mode seed rows.
- [ ] ShoppingSummary rewired: persisted rows replace the derived
      aggregation; ad-hoc section visible with added-by note; remove
      + add UI; derived read-only fallback for rowless batches.
- [ ] design.spec amended (same change set).
- [ ] e2e: shopping-summary.spec extended — check persists across
      reload, remove hides the row, add shows the new row.
- [ ] `./harness check` green; commit; live check with the household
      list (both partners see one edit).

## Steps

1. Hook + mock seed, unit-testing the query shape (batch rows ∪
   unchecked batchless ad-hoc, removed excluded) against mockClient.
2. Page rewire behind the loading/empty states that already exist;
   keep Batch Pool sidebar and print/copy.
3. Editing UI (check/remove/add) with emoji feedback; design.spec
   amendment.
4. e2e extension in mock mode.
5. `./harness check`, commit, handoff; live verification on the real
   household list.

## Verification

- `./harness check` passes (incl. e2e).
- e2e: a checked row survives reload; a removed recipe row disappears
  and STAYS gone after the pool changes (mock reconcile or seeded
  regeneration); an added item appears with adhoc styling.
- Live: check an item on the web → chat `visa listan` no longer shows
  it; `ta bort` in chat → row gone on the web without a manual
  reload (or on next focus, per chosen mechanism).

## Evidence

(pending)
