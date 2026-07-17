# AGENTS.md — Vega Plan Hub

Durable repo memory for AI agents. Canonical: every other runner file
(`CLAUDE.md`, `.github/copilot-instructions.md`) defers to this one.
Vega Plan Hub is a playful, emoji-filled vegan meal-planning app
(Vite + React 19 + TypeScript SPA, Supabase auth + persistence). The
spec corpus: [product.spec.md](docs/specs/product.spec.md) (problem),
[tech.spec.md](docs/specs/tech.spec.md) (solution),
[design.spec.md](docs/specs/design.spec.md) (UX),
[conventions.spec.md](docs/specs/conventions.spec.md) (code style),
[harness.spec.md](docs/specs/harness.spec.md) +
[orchestration.spec.md](docs/specs/orchestration.spec.md) (workflow).

## Source-of-truth order

1. [docs/specs/](docs/specs/) — what is always true (harness,
   orchestration, conventions). Changing a spec is a human decision.
2. [docs/execplans/](docs/execplans/) — what to build, in what order.
3. Code.

If implementation reveals a legitimate contract change: spec first, then
execplan, then code — in the same change set.

## Default workflow

1. Read the relevant spec(s) and the active execplan.
2. Make the scoped change, test-first; record the evidence (commands and
   output) in the execplan's Evidence section.
3. Run `./harness check` — it must pass before every handoff.
4. Update the execplan `status` frontmatter if it changed.
5. Commit the scoped files; state the commit hash in the handoff note.

The harness answers every deterministic question — never compute
readiness, ordering, or gate status yourself:

```
./harness check            # THE gate: lint, build, plan validation
./harness plans --ready    # what is dispatchable now
./harness plans --validate # is the backlog coherent
```

## Handoff standard

Every handoff states: exact harness command(s) run · pass/fail · any
skipped check and why · fixtures/schemas/harness commands added or
changed · residual contract risk not yet covered by a deterministic
check · the commit hash. Commit scoped changes before handoff so every
loop is restartable from repository state.

## Non-goals

- No new backend surface beyond Supabase; schema changes are ask-first
  (boundaries in [tech.spec.md](docs/specs/tech.spec.md)).
- No backfilling git history into execplans; plans cover new work only.
- No weakening any harness gate; grandfathered lint exceptions in
  `eslint.config.js` may only shrink.
- No breaking the playful spirit: emojis, design tokens, and animations
  are product requirements, not decoration
  ([conventions.spec.md](docs/specs/conventions.spec.md)).

## Self-improvement rule

When a session discovers a gap that a deterministic check could have
caught, add that check to `./harness` in the same change set. Details
and the maturity ladder: [docs/specs/harness.spec.md](docs/specs/harness.spec.md).
