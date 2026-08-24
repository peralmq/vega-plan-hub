---
id: p4-09-recipe-edits-via-chat
title: Structured recipe edits via chat — "dubbla vitlöken" changes the table, with a before→after confirm
phase: P4
status: in-progress
depends_on: [p4-08-recipe-notes-via-chat]
---

## Goal

p4-08's live-smoke feedback, made real: "dubbla vitlöken" should not
just leave a note — it should double the garlic rows in the recipe's
ingredient table, and the confirmation message must show the sender
exactly what will be saved ("garlic cloves: 3 → 6 st") before
[Ja, spara]. Interpretation is deterministic rules over the raw
utterance (dubbla/halvera/tredubbla + English equivalents); the term is
bridged Swedish→table-key via `ingredients.json` synonyms
("vitlöken" → `garlic`). Anything the rules can't interpret falls back
to the p4-08 notes path unchanged. Contract: tech.spec "Structured
recipe edits" (adopted 2026-08-24, Pelle in chat, same change set).

## Non-goals

- No LLM interpretation of the edit — rules only. If the rules miss,
  it's a note, never a guess. (The NLU `note` slot is known to compress
  away the verb — heldout fixture expects "dubbla vitlöken …" →
  note "vitlök" — which is exactly why interpretation reads the raw
  text, not the slot.)
- No edits beyond ingredient-quantity scaling (no instruction rewrites,
  no frontmatter, no adding/removing rows). Each new operation is its
  own spec-visible addition.
- No compound utterances ("dubbla vitlöken och halvera saltet") — first
  match wins in v1.

## Context

Feedback origin: p4-08 Evidence (live smoke, 2026-08-24). Threat
model unchanged from p4-08 (r4 §4 T2): the edit is computed by pure
code from a rules-matched utterance; the confirm gate, validate-recipe
pre-flight, rollback, and fixed-arg git all stand. Data reality
(corpus survey at implementation): quantity cells contain integers,
decimals, ranges with hyphen and en-dash ("2-3", "6–10"), fractions
("1/2"), and empties; scaling must handle all numeric shapes and
refuse (→ note fallback) otherwise. Key-cell matching is exact against
the candidate set (term + definite-suffix-stripped forms + the
`ingredients.json` key whose synonyms contain a candidate) so "vitlök"
scales `garlic` rows but never `garlic-powder`; when no key matches, a
word-boundary match on the ingredient display cell is tried — the
human confirm gate makes that safe. On the edit path no note bullet is
appended: provenance lives in the git commit, and the recipe should
read as if authored that way.

## Progress

- [x] tech.spec "Structured recipe edits" contract recorded
- [x] Pure core `src/lib/recipeEdits.ts` (interpret / candidates /
      apply / describe) with unit tests over real corpus shapes
- [x] Bot wiring: edit-vs-note branch in prepareRecipeChange, richer
      confirm message, `publishRecipeEdit` beside `publishRecipeNote`
- [x] Local end-to-end git test (scale garlic in a scratch clone,
      assert table change + push; fallback + rollback still hold)
- [x] Live-miss fix (2026-08-24 screenshot): edit verbs classified
      note_recipe at the RULES layer; verb set extended (mer/mindre
      family, dubblera/tripla, set-to-N); fixtures grown to 79
- [ ] M1: pull + restart; live smoke "dubbla vitlöken i <dish>" lands
      the table change on Pages

## Steps

1. Spec bullet (same change set).
2. `src/lib/recipeEdits.ts`, test-first: `interpretEdit(rawText)` →
   `{ factor, term } | null`; `expandTermCandidates(term, synonyms)`
   reusing `matchCandidates`; `applyScale(markdown, candidates,
   factor)` → `{ markdown, changes[] } | { error }` handling
   int/decimal/range/fraction quantities; `describeChanges` for the
   confirm message.
3. Bot: `loadIngredientSynonyms` (fs, like the recipe index) in
   `recipePublish.ts`; `publishRecipeEdit` recomputing the scale on the
   fresh file inside the same validate→rollback→commit→push shell;
   `tools.ts` branches note-vs-edit and stages `pendingChange`.
4. Local e2e against the scratch bare remote; `./harness check`.
5. M1 pull + restart; live smoke; record evidence.

## Verification

- `./harness check` passes; recipeEdits unit suite covers: sv/en verbs,
  suffix stripping, synonym bridge, exact-key precedence over
  substring (garlic vs garlic-powder), range/decimal/fraction scaling,
  non-numeric refusal, no-match refusal.
- Local e2e: doubled quantities visible in the pushed file; an
  uninterpretable utterance still produces a note; validator-failure
  rollback still leaves no commit.
- Live: confirm message shows per-row before→after; the pushed commit
  changes only quantity cells of matched rows.

## Evidence

**2026-08-24 (implementation + local e2e, pre-deploy):**

- `./harness check`: deps OK (73), lint OK, test OK (incl. 10 new
  recipeEdits cases over real corpus quantity shapes), build OK, tsc
  bot OK, tsc compare OK, plans validate OK (24), validate-recipe
  OK (30).
- Local end-to-end (scratchpad `p4-09-e2e.mts`, scratch clone + scratch
  bare origin, real utterance "dubbla vitlöken i mapo tofun nästa
  gång"): interpreted `{factor: 2, term: "vitlöken"}`; candidates
  bridge to `garlic`; confirm preview `• garlic cloves: 2 → 4 st`;
  publish `{committed: true, pushed: true}`, bare HEAD `p4-09 recipe
  edit: mapo-tofu ×2 (via Vega chat)`; the pushed diff changes exactly
  the previewed row count (1 → 1, quantity cell only). "mindre stark
  nästa gång" interprets to null → note fallback confirmed.
- Design holds from p4-08 unchanged: publish shell refactored to one
  `publishRecipeChange` core (fresh-base pull → transform → validate
  with rollback → commit → push); the edit re-derives the scale from
  the fresh post-pull file at publish time, so a stale confirm can
  never double an already-changed row — it re-applies or fails loudly.
- M1 deploy for this plan is just `git pull` + bot restart (no new env,
  no new credentials beyond p4-08's).

**2026-08-24 (live miss + fix, same day):** Pelle's live try "dubbla
vitlöken i mapo tofun" (no "nästa gång") got the unsupported-intent
reply — the LLM classifier filed it under planning, so interpretEdit
never ran. Fix: these phrasings are now claimed deterministically by
`parseWithRules` (guards: negations, "portion" → plan_set_multiplier,
leading shopping verb; vague mer/mindre needs a next-time anchor), and
the operation set grew per the amended spec bullet: dubblera/tripla,
×1.5 öka/mer, ×0.75 dra ner på/minska/mindre, set-to-N ("ändra X till
4", "ta 4 X istället", single-row only). Surprise recorded: JS `\b` is
ASCII-only, so verb boundaries next to å/ä/ö silently failed ("ändra",
"dra ner på") — replaced with letter-class lookarounds, caught by the
unit suite. Evidence: 7 new rules fixtures (79 total, incl. the exact
live-miss utterance) + decline-guard tests, all 92 parser tests green;
recipeEdits suite at 14; `./harness check` fully green; e2e re-run:
"dubbla vitlöken i mapo tofun" → rules-claimed → preview `garlic
cloves: 2 → 4 st` → pushed commit `p4-09 recipe edit: mapo-tofu ×2
vitlöken (via Vega chat)` with a 1-row diff. Reminder recorded from the
same screenshot: the M1 still has `RECIPE_PUSH=0` and a dry-run note
commit on its local main — reset or push before going live.
