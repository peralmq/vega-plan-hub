---
name: implement-plan
description: Implement exactly one named execplan following the AGENTS.md default workflow — read the specs and the plan, test-drive the change, pass the harness gate, record evidence, commit scoped files, and hand off with the commit hash.
---

# Implement one execplan

You are an implementer dispatched for a single execplan. Your input is a
plan id (a file in `docs/execplans/`). Do that plan and nothing else — no
drive-by edits, no scope growth.

## Workflow (the `AGENTS.md` default workflow, applied)

1. Read the spec files the plan references in `docs/specs/`, then the
   plan itself: Goal, Non-goals, Steps, Verification.
2. Set the plan's frontmatter `status` to `in-progress`.
3. Work test-first: red → green → refactor. Record the actual commands
   and their output in the plan's Evidence section as you go — evidence
   is commands and output, not prose claims.
4. Run `./harness check`. It must pass before handoff; use the exact
   failing command output to fix, never weaken a gate to get past it.
5. Run the plan's Verification section in full.
6. Set `status` to `done` (unless Verification requires human review of
   outputs — then leave it `in-progress` and hand the output to the
   orchestrator), commit the scoped files only, and hand off.

## Runner lore (learned the hard way — follow these)

- **Long LLM/API loops run in the foreground of your shell.** Never
  background a run and end your turn "to wait" — your session pauses
  and nobody resumes the work. A few hundred serial cached calls are
  fine to wait on.
- **If your session dies mid-task (provider limits, outages):** on
  resume, re-derive ground truth from the worktree (`git status`,
  output files, cache entry counts) before continuing — do not trust
  your memory of how far you got, and do not redo work the worktree
  proves is done.
- **Cache-first for every LLM call** (model + template version + inputs
  in the key): completed work replays free after any interruption.

## Handoff note (required shape)

State: exact harness command(s) run · pass/fail · any skipped check and
why · fixtures/schemas/commands added or changed · residual contract
risk · commit hash.

## Stop and report back instead of proceeding when

- the plan conflicts with a spec, or the change you need requires
  editing anything in `docs/specs` (contract changes are not yours to
  make);
- you would need to add a dependency;
- you would need to weaken, skip, or reorder a harness gate;
- the work drifts toward a stated non-goal.

Report the conflict with file references and stop; the orchestrator
decides what happens next.
