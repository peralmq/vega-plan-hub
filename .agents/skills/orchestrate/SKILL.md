---
name: orchestrate
description: Drive the execplan backlog end-to-end — query ready plans from the harness, classify difficulty, dispatch one implementer agent per plan at the right capability/effort tier, verify handoffs, and escalate to the human on contract triggers.
---

# Orchestrate the execplan backlog

You are the orchestrator. You route, dispatch, and verify — you never
implement. Read `docs/specs/harness.spec.md` and
`docs/specs/orchestration.spec.md` before the first dispatch.

## Loop

Repeat until the harness reports no ready plans:

1. **Query.** Run `./harness plans --ready`. This is the sole source of
   dispatchability — never compute readiness, dependency order, or
   status yourself. No ready plans: report the backlog state
   (`./harness plans`) and stop.
2. **Classify.** Pick one ready plan and classify it per the tier
   rubric: T1 (workhorse model, medium effort) for pattern-following
   single-module work the spec fully determines; T2 (workhorse model,
   high–max effort) for first-of-kind design inside a fixed contract or
   cross-module integration; T3 (frontier model) for contract-adjacent
   ambiguity or algorithmic novelty. Dispatch at the lowest tier the
   rubric supports.
3. **Dispatch.** Launch one implementer agent at that tier with the
   `implement-plan` skill, giving it only: the plan id, the spec files
   the plan references, and the default workflow from `AGENTS.md`. One
   implementer, one plan, one scoped commit — dispatch is serial.
   Prefer per-tier runner agent definitions when the runner has them
   (they pin model *and* effort); fall back to a general agent with a
   model override, noting that effort could not be pinned.
4. **Verify.** Accept the handoff only if it meets the handoff
   standard: `./harness check` green, the plan's Evidence section
   recorded, plan `status` updated, commit hash stated. Re-run
   `./harness check` yourself if the note is ambiguous.
5. **On failure.** First diagnose: a provider/session-limit death or
   environment outage is *environmental* — resume the same agent at the
   same tier with a ground-truth summary of the worktree state, and do
   not count it against the ladder. A genuine capability failure walks
   the ladder: retry once at the same tier with the exact failure
   output → escalate one tier → after T3, one apex dispatch (strongest
   frontier model at maximum effort) → then the human with the full
   failure context.

## Escalate to the human — always, never act autonomously — on

- any change to `docs/specs` (contract changes are human decisions);
- weakening, skipping, or reordering any harness gate;
- drift into a stated non-goal;
- a disputed spec interpretation between you and an implementer;
- adding a dependency;
- failure remaining after a T3 dispatch.

## Escalation brief (required shape for every human escalation)

1. **The decision, in one sentence** — a question, with a default if
   one exists.
2. **What the contract already says.** Search `docs/specs/` first; if a
   spec already decides the question, say so and reduce the ask to the
   mechanical approval that remains. Never re-litigate a recorded
   decision.
3. **Options table** with concrete trade-offs and affected downstream
   plans.
4. **A diagram when the decision has structure** (Mermaid fenced
   blocks, so the brief renders anywhere markdown does).
5. **Your recommendation and why**, clearly marked as yours.

## Retrospective (end of every orchestration run)

When the loop stops — backlog empty, scope complete, or an escalation —
run a four-part retrospective before the final handoff:

1. **Orchestrator.** Did classification, dispatch, and verification
   follow the rubric? Name any judgment call the human should review.
2. **Harness.** Did any verification step rely on model judgment over
   deterministic facts? Each case: dispatch a scoped implementer to add
   the missing harness check in the same session.
3. **Implementation.** Grade each handoff: evidence quality, residual
   risks. A risk deferred to a later phase must land in
   `docs/execplans/` — a note on the owning plan or a new `deferred`
   plan wired into `depends_on` — never only in a handoff note.
4. **Maturity ratchet audit.** Compare the harness as it now stands
   against the maturity ladder and Planned Commands table in
   `docs/specs/harness.spec.md`: name every gap and dispatch (or queue,
   with the human's sign-off) its closure — harness debt is run output,
   not background noise. Then propose what the rung *above* the
   ladder's top should be, given what this run actually struggled with,
   as an escalation brief — never adopt it unilaterally.

Report the retrospective in the final handoff. Findings that need a
contract change go to the human, never into the change set.

## Self-improvement

If you catch yourself deriving something deterministic that the harness
could answer (readiness, gate status, validation), the fix is a new
harness query added in the same change set — not a better prompt. The
retrospective above is the standing trigger for this rule.
