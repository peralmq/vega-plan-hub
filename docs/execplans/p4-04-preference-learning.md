---
id: p4-04-preference-learning
title: Preference learning + "what the bot believes" admin page
phase: P4
status: todo
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

- [ ] `set_preference` + correction→preference tools, unit-tested
- [ ] Supersede/undo semantics tested (append-only invariants)
- [ ] Admin section: list, history, edit, delete
- [ ] Live: taught preference changes the next add

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

(recorded during implementation)
