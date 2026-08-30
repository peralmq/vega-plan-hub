---
id: p4-04-preference-learning
title: Preference learning + "what the bot believes" admin page
phase: P4
status: in-progress
depends_on: [p4-02-capture-bot]
---

## Goal

Script 3 in production: explicit switches ("vi har bytt från X till
Y") and correction-taught preferences ("nej, penne" → `[New usual]` /
`[One-off]`) write append-only `product_preferences` rows
(supersede, never update; `[Undo]` re-points `superseded_by`). The
web Account area grows a small "what the bot believes" section:
current preferences with history, editable and deletable — the
inspectability contract from r4/A.8.

## Non-goals

- No observed/implicit learning from check-off substitutions (v2;
  `source='observed'` stays unwritten).
- No per-person preferences (column written null per the gate call).
- No vector/episodic memory of any kind.

## Context

Trust boundary: structured rows are the store of record
(research-plan A.8, r4 §1); resolution happens at add-time (gate
call), so preference changes affect *future* adds only — the admin
page must make that visible ("since <date>"). UX: Script 3 including
the stated-memory reply ("was: Oatly since March") and `[Undo]`.
Intents `set_preference` + the correction flow exist in the r3 fixture
contract; p4-02 built the tool plumbing this extends. Web side:
`src/pages/Account.tsx` + a new feature component (not under
`components/ui/`).

## Progress

- [x] `set_preference` + correction→preference tools, unit-tested
- [x] Supersede/undo semantics tested (append-only invariants)
- [x] Admin section: list, history, edit, delete
- [ ] Live: taught preference changes the next add
- [ ] 2026-08-31 (retro finding): `src/mocks/mockStore.ts` has no
  `product_preferences` case, so the populated branch of the admin
  section can't be eyeballed via `./harness dev-mock` — add the mock
  case before marking this plan done

## Steps

1. Tools: `set_preference` (explicit) and the `[New usual]` branch of
   `correct_last`; both insert + supersede atomically.
2. Stated-memory reply built from the history query (previous current
   row + its `valid_from`).
3. `[Undo]` handler: re-point `superseded_by`, confirm via ✏️ edit.
4. Admin UI: current preferences table + expandable history, inline
   edit (creates a superseding row, `source='explicit'`), delete.
5. Unit tests on the append-only invariants (exactly one current row
   per ingredient; undo restores the prior current).

## Verification

- `./harness check` passes with the new unit tests.
- Fixture replay: Script 3's two dialogues end-to-end against the
  mocked Bot API.
- Live: teach "vi har bytt till ICA havredryck" in chat; the admin
  page shows it with history; the next "köp mjölk" resolves to it
  (the research-plan success criterion, verified round-trip).

## Evidence

**Design decision, resolved during implementation**: two open questions
had no prior answer in the plan text and had to be settled to write the
correction flow.

- *Which canonical bucket does `[New usual]` teach?* Script 3's
  "nej, penne" example corrects a `pasta` insert to `penne`; the
  existing (p4-02) `correct_last` handler already updates the
  shopping-list row's `canonical_ingredient` to the REPLACEMENT's own
  normalized form ("penne"), for check-off matching. But the round-trip
  success criterion ("the next 'köp mjölk' resolves to it") only works
  if the taught preference is keyed on the ORIGINAL bucket ("pasta"),
  not the replacement — otherwise "köp pasta" next time would never
  find it. `ChatState.lastInsert` was extended with a parallel
  `canonicalIngredients` array so `correct_last` can teach against the
  bucket the household was actually shopping for, while leaving the
  list-item swap untouched. Covered by
  `bot/tools.test.ts`: `'"nej, penne" then [New usual] teaches the
  ORIGINAL bucket ("pasta")...'`.
- *What does `[Undo]` do when there was nothing to restore* (a
  brand-new teach, corrected)? — and what does the admin "delete" do,
  given the store is append-only (never a real `DELETE`)? Both retire
  the current row by pointing `superseded_by` at itself — a
  self-reference — rather than at another row, so "exactly one current
  row" holds with zero current rows for that ingredient. Implemented as
  one primitive, `planUndo(currentId, previousId)`; the admin delete is
  `planUndo(current.id, null)`. Covered by
  `src/lib/productPreferences.test.ts` (`planUndo` describe block) and
  `bot/tools.test.ts` (`"[Undo] with nothing before it retires the
  just-taught row onto itself"`).

Neither is a spec/contract change — both are inferences from the
`r4-data-model-security.md` §1 append-only design and the plan's own
stated success criterion, not a new table, column, or non-goal.

```
$ ./harness check
check: deps ... OK (73 deps present)
check: npm run lint ... OK (8/8 warnings)
check: npm test ... OK
check: npm run build ... OK
check: tsc bot ... OK
check: tsc compare ... OK
check: plans --validate ... plans validate: OK (35 plans)
check: validate-recipe ... validate-recipe: OK (30 recipes)
check: OK

$ npx vitest run bot/tools.test.ts src/lib/productPreferences.test.ts src/lib/intentParser.test.ts
 Test Files  3 passed (3)
      Tests  144 passed (144)
```

Fixture replay (Verification bullet 2), against the fake Supabase +
mock Telegram adapters, both Script 3 dialogues end to end
(`bot/tools.test.ts`, describe `"p4-04: preference learning (Script
3)"`, 10 tests):

- Explicit switch ("btw vi har bytt från oatly deluxe till ica
  havredryck...") inserts a new current row + supersedes the prior one
  atomically, replies with the stated-memory clause ("was: Oatly
  Havredryck Deluxe sedan mars") and an `[Undo]` button; with no prior
  preference the "was:" clause is omitted.
- "nej, penne" → `[New usual]` teaches `pasta → penne`,
  `source='correction'`; `[One-off]` writes nothing.
- `[Undo]` restores the prior current row and re-points the new one
  (row count never shrinks — nothing is ever deleted); with nothing to
  restore it retires onto itself; a second `[Undo]` tap (or a stale
  `[New usual]`/`[Undo]` after a restart) gets an honest "nothing to
  undo" / "nothing fresh to remember" reply instead of guessing or
  double-writing.
- A taught preference resolves the very next `köp mjölk` (the
  research-plan round-trip), reusing `handleMessage`'s existing
  add-time resolution unmodified.

Web admin (Verification is silent on a dedicated check here, but
visually smoke-tested manually): `PreferenceBeliefs` mounted on
`/account` via `./harness dev-mock`, both themes, no console errors —
screenshot evidence not persisted (ephemeral browser check only). The
populated (edit/history/delete) branch was NOT visually exercised:
`src/mocks/mockStore.ts`'s table dispatcher has no `product_preferences`
case (falls into its `default: return { data: [] }`), which predates
this plan and is shared dev-mock infrastructure — out of scope to wire
up here, so only the empty state was checked visually. The write paths
(`editPreference`/`deletePreference`) reuse the same
`planSupersede`/`planUndo` primitives already unit-tested and bot-tested
above, executed through plain `supabase.from(...).insert/.update` calls
matching the established hook style (`useFamilyMembers.ts`).

**Residual / explicitly not done**: the plan's third Verification
bullet — "Live: teach ... in chat; the admin page shows it with
history; the next 'köp mjölk' resolves to it" — requires the live
household bot (a separate checkout, `~/Projects/vega-plan-hub`, out of
scope per this run's standing directive: "Do NOT deploy anything to the
live bot checkout... work only in this repo") and a live Telegram
session. Not attempted; `status` stays `in-progress` pending that human/
live round trip. No Supabase migration was needed — `product_preferences`
is already in the approved, applied P4 schema (confirmed against
`supabase/migrations/20260812065030_*.sql`); nothing was applied to the
live project.
