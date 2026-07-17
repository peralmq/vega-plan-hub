# Self-Improving Agentic Harness — Vega Plan Hub

Status: binding. Adopted 2026-07-17 from the portable kit in
`idiolect/docs/portable/` (brownfield path). Companion spec:
[orchestration.spec.md](orchestration.spec.md) (the loops that run on top
of this harness). Code conventions live in
[conventions.spec.md](conventions.spec.md).

## The idea in one paragraph

Agents are a thin prompt layer over a fat deterministic harness. Every
question that has a deterministic answer — what is ready to work on, did
the change pass, is the backlog coherent — is answered by a versioned
command-line tool checked into the repo, never by model judgment. The
model layer decides only what the harness cannot: classifying difficulty,
doing the implementation, and recognising when a task has hit a contract
boundary. The harness is **self-improving by convention**: when a session
discovers a gap that a deterministic check could have caught, it adds
that check to the harness *in the same change set*. The harness only
ratchets up; it never regresses.

## Repository layout

| Path | Role |
| --- | --- |
| `AGENTS.md` | Durable repo memory: source-of-truth order, default workflow, non-goals, handoff standard. Canonical; `CLAUDE.md` is a one-line pointer to it. |
| `docs/specs/` | What is *always true*: this spec, orchestration, code conventions. Changing a spec is a human decision. |
| `docs/execplans/` | What to build and in what order: one file per plan, machine-validated frontmatter. New work only — backfilling history is a non-goal. |
| `docs/research/` | Rationale, not contract. Loaded only when a task needs the *why*. |
| `docs/notes/` | Run outputs, experiment verdicts — the audit trail. |
| `harness` | The deterministic harness CLI: a single zero-dependency Node script at the repo root. |
| `.agents/skills/` | Thin skill definitions (orchestrator, implementer). `.claude/skills` is a disposable symlink shim, never the source of truth. |

### Source-of-truth order

1. `docs/specs/` — what is always true.
2. `docs/execplans/` — what to build, in what order.
3. Code.

If implementation reveals a legitimate contract change: update the spec
first, then the execplan, then code — in the same change set.

## The harness CLI

`./harness` — one executable Node script (ES modules, **zero
dependencies**), versioned with the code. Properties: deterministic;
fail-fast and specific (a failure names the exact failing command or
file); fast enough to run before every handoff.

### Command set

```
./harness check            # THE gate: npm run lint (strict), npm run build
                           # (the type gate), plans --validate. Must pass
                           # before every handoff.
./harness plans            # list plan id, phase, status, dependencies
./harness plans --validate # frontmatter schema, dependency existence, cycles
./harness plans --ready    # dispatchable plans: status todo, all deps done
./harness plans --phase P0 # a phase's plans + deterministic rollup line
```

Grandfathered pre-harness lint violations are scoped per-file in
`eslint.config.js` — that list may only shrink; the rules stay on for all
new code. Never weaken an existing gate to make a later phase pass.

### Planned Commands

Do not add a command before its phase needs it.

| Command | What it does | Trigger |
| --- | --- | --- |
| `./harness e2e` | Runs the Playwright suite (`playwright.config.ts` is already wired) on demand; too slow for `check` | the first e2e test lands |
| `./harness validate-recipe <file>` | Schema check for recipe markdown (required sections, ingredients, metadata) | the next recipe-content work |
| `./harness test` | Vitest unit tests, joins `check` | the first unit test lands |

## ExecPlans

One markdown file per unit of dispatchable work, with frontmatter the
harness validates:

```yaml
---
id: p0-00-harness-bootstrap   # must match the filename; p<phase>-<nn>-<slug>
title: <one line>
phase: P0
status: todo | in-progress | done | deferred
depends_on: []                # other plan ids
---
```

Body sections: **Goal** (with links to motivating evidence),
**Non-goals**, **Steps**, **Verification** (concrete commands that prove
it done), **Evidence** (appended during implementation: actual commands
and output, not prose claims).

- `--ready` makes dispatchability a harness query — no agent computes
  readiness, ordering, or status itself.
- A plan whose Verification requires *human review of outputs* cannot be
  marked `done` by an agent — run the mechanical checks, hand the output
  to the human, and complete the plan only after their feedback is
  recorded in Evidence.
- Risks deferred to later phases become execplan entries — never lore in
  a handoff note.

## The self-improvement rule

> When a session discovers a gap that a deterministic check could have
> caught, add that check to the harness **in the same change set**. The
> harness only ratchets up; never weaken an earlier gate to make a later
> phase pass.

Triggers: a shipped bug a lint/schema/fixture check would have caught →
the check joins `./harness check` now; an agent re-deriving something
deterministic → a new harness query, **not a better prompt**; ad-hoc
verification of something the maturity ladder assigns to the harness →
schedule the owning command. The standing enforcement mechanism is the
retrospective defined in [orchestration.spec.md](orchestration.spec.md).

## Maturity ratchet

Declared honestly (brownfield adoption, 2026-07-17): the repo was at
**Level 0**; this adoption lands **Level 1**. Audit against this table in
every retrospective.

| Level | Interpretation for this repo | Status |
| --- | --- | --- |
| 0 | Prompt-only work, no checks | superseded |
| 1 | `AGENTS.md`, specs, green `./harness check` (lint, build, plan validation) | **current** |
| 2 | Machine-checkable contracts: schema-validated execplans (done), recipe schema validation, first unit tests with a TDD-evidence convention | next |
| 3 | Deterministic end-to-end smoke: Playwright suite runs against the built app; `./harness e2e` | first e2e test |
| 4 | CI gates (`./harness check` in GitHub Actions), regression tracking | first release discipline |
| 5 | Agent-ready phase gates: every execplan names the harness evidence required before handoff | mature orchestration |

Adding a level is a spec change and therefore a human decision.

## Skills: thin by contract

Skills (`.agents/skills/<name>/SKILL.md`) are markdown prompts plus
verbatim harness command references — no embedded logic. If a skill
contains a decision procedure the harness could execute, that procedure
moves into the harness and the skill shrinks. The standard surface:
`orchestrate` (outer loop) and `implement-plan` (inner loop).

## Context discipline

Behavior lives in `docs/specs`, sequencing in `docs/execplans`, checks in
`./harness`, instructions in a short `AGENTS.md`. A future agent doing a
scoped change should need one spec, one module, and one execplan — never
the whole corpus.
