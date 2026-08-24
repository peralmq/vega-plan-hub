---
id: p4-08-recipe-notes-via-chat
title: Recipe notes via chat — "mindre stark nästa gång" lands in the repo and the cooking view
phase: P4
status: in-progress
depends_on: [p4-02-capture-bot]
---

## Goal

r1 Script 4, made real: a household partner says "mindre stark nästa
gång" in Telegram while cooking; the bot resolves which recipe (a title
named in the message, else today's `planned_meals` row), asks for
confirmation with an inline button, and on [Ja, spara] appends the note
to the recipe's `## Notes` section, validates with `./harness
validate-recipe`, commits, and pushes to `main` — where CI re-validates
and the Pages deploy puts the note in the CookMode view (~1–2 min).
This un-stubs the `note_recipe` intent (parser has recognized it since
p4-02; `botActions` routed it to UNSUPPORTED) and is the first — and
only — sanctioned repo-write path from chat (tech.spec "Recipe notes"
contract, adopted 2026-08-24).

## Non-goals

- No structural recipe edits (ingredients, instructions, frontmatter) —
  notes only. Structural edits are a future plan with their own gate.
- No LLM-generated file content: the only free text written is the
  parser's extracted `note` slot, verbatim, inside a deterministic
  template. No shell for the LLM, ever (r4 §4 T2 stands).
- No "your change is live" deploy polling in v1 — the reply sets the
  ~2 min expectation instead. Candidate follow-up.
- No mirroring notes into `recipe_comments` (open question from the R7
  research; decide separately).

## Context

Research: docs/research/r7-recipe-chat-edit-pipeline.md (2026-08-24;
options, contract analysis, phasing — this plan is its Phase 1).
Contract: tech.spec.md "Recipe notes" bullet (adopted 2026-08-24, Pelle
in chat, same change set). UX: r1-conversation-scripts.md Script 4.
Threat model: r4 §4 T2 — mitigations here are the enumerated tool,
path restriction to `src/data/recipes/<id>.md`, harness pre-flight with
rollback, and human confirmation before any commit. Dispatched directly
by the human 2026-08-24 (p4-02's live smoke is still pending; this plan
rides the same deployed transport). Note-language decision: household
notes are written verbatim (Swedish OK) — they are household voice, not
curated recipe content; the corpus-English rule (recipe-format.spec)
was about tags and curated content, and the validator does not check
note language.

## Progress

- [x] tech.spec "Recipe notes" contract recorded; `bot/.env`
      gitignored (leak-path prerequisite)
- [x] Pure core in `src/lib/recipeNotes.ts` (append/format/resolve)
      with unit tests
- [x] `note_recipe` un-stubbed in `botActions` (now a write action;
      must-not-act suite updated and still proving zero writes for
      chitchat/negation)
- [x] Bot side: recipe index, confirm flow, `publishRecipeNote` tool
      (validate → rollback-on-fail → fixed-arg git), consumer wiring
- [x] Local end-to-end git test against a scratch bare remote
- [ ] M1 deployment: pull, set push credentials (deploy key) +
      `github.com` egress, restart bot
- [ ] Live smoke: a real "mindre stark nästa gång" from a partner
      lands on GitHub Pages

## Steps

1. Spec + hygiene in the same change set: tech.spec contract bullet,
   `bot/.env` into `.gitignore`.
2. Pure logic (`src/lib/recipeNotes.ts`): `appendRecipeNote` (bullet
   into `## Notes`, create section if missing), `formatNoteLine`
   (attribution + date template), `matchRecipeTitle` (longest
   case-insensitive title substring). Test-first.
3. `botActions`: `NoteRecipeAction`, planner case, WRITE_ACTIONS
   membership; update the unsupported-intents fixture loop.
4. Bot side (`bot/recipePublish.ts`): fs recipe index (tsx can't use
   the app's `import.meta.glob` loader); `publishRecipeNote` with id
   regex guard, harness pre-flight, rollback, `pull --rebase` → `add`
   → `commit` → `push origin main` via `execFile` (never a shell
   string). `bot/tools.ts`: resolve → pending-note state → inline
   [Ja, spara]/[Avbryt] → publish on callback. `bot/env.ts`:
   `RECIPE_REPO_DIR` (default: the checkout the bot runs from),
   `RECIPE_PUSH=0` for commit-only dry runs.
5. Local end-to-end: scratch clone with a bare "origin", run the tool,
   assert the commit landed and the file validates.
6. Deploy to the M1 (pull, credentials, egress, restart) and live-smoke
   with a real partner utterance; record log lines + the commit hash
   the bot pushes.

## Verification

- `./harness check` passes (unit suite now covers recipeNotes +
  note_recipe planning; validate-recipe corpus unchanged).
- Must-not-act fixtures still prove zero write actions for chitchat and
  negation utterances; `note_recipe` without a confirmed button press
  provably performs no git operation (the publish call sits only in the
  `note_yes` callback path).
- Local git e2e: note bullet present in the scratch clone's HEAD and in
  the bare remote's `main`; `./harness validate-recipe` passes on the
  modified file.
- Live: partner note visible in CookMode on GitHub Pages within ~2 min;
  `[row N] intent=note_recipe` log line; bot-authored commit on `main`.

## Evidence

**2026-08-24 (implementation + local e2e, pre-deploy):**

- `./harness check`: deps OK (73), lint OK, test OK (237 tests / 11
  files, incl. new `src/lib/recipeNotes.test.ts` and the updated
  must-not-act + note-planning cases), build OK, tsc bot OK, tsc
  compare OK, plans validate OK (23), validate-recipe OK (30).
- Local end-to-end (scratchpad `p4-08-e2e.mts`: scratch `git clone
  --local` of this repo with a scratch bare `origin.git`, real
  `publishRecipeNote` + real `./harness validate-recipe`):
  1. Happy path: `{ committed: true, pushed: true }`; bare origin HEAD
     `93c4667 p4-08 recipe note: mapo-tofu (via Vega chat)`; bullet
     `- Mindre stark (Saga via Vega, 2026-08-24)` present in the pushed
     file.
  2. Structure injection: a multiline note carrying `## Ingredients` +
     a table row is flattened to ONE bullet (single `## Ingredients`
     heading in the pushed file). **Surprise:** validate-recipe accepts
     a lone extra trailing section, so sanitization in
     `appendRecipeNote` (collapse all whitespace) is the real defense —
     found by this test failing first, fix + unit test added in the
     same change set.
  3. Rollback: with the clone's harness stubbed to exit 1, the publish
     aborts, the file is byte-identical to before, and HEAD is
     unchanged — no commit exists on validation failure.
  4. Path guard: `recipeId: "../../etc/passwd"` rejected by the
     kebab-case id regex before any fs access.
- Must-not-act guarantee held at three layers: planner (`note_recipe`
  with an empty slot plans noop; unit-tested), tools (`prepareNote`
  only stages state + asks), and git (`publishRecipeNote` is called
  exclusively from the `note_yes` callback branch).
- Decision (recorded in Context): notes are committed verbatim in the
  sender's language — household voice, not curated corpus content.
- Deploy prerequisites for the M1 (open): pull this commit into the
  deployment checkout; grant push (repo-scoped deploy key or household
  git credentials, gitignored mode-600); add `github.com` to the r6
  egress allow-list; restart `npm run bot` and check the
  `[boot] recipe notes: repo=… push=on` line. `RECIPE_PUSH=0` gives a
  commit-only dry-run mode for the first live smoke if preferred.
