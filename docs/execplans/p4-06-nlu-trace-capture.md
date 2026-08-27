---
id: p4-06-nlu-trace-capture
title: NLU trace capture — labelled real-usage dataset for continuous eval
phase: P4
status: todo
depends_on: [p4-02-capture-bot]
---

## Goal

Every message the assistant parses becomes a labelled datapoint. The
bot logs each inbound utterance with its full parse trace (chosen
intent, extracted slots, model + harness version, latency) to an
append-only `nlu_traces` table, then attaches a correctness signal
from what happens next in the conversation:

- **implicit-correct**: the action stood — no correction, no undo,
  item later checked off as-is;
- **implicit-wrong**: user sent `correct_last` ("nej, penne"), tapped
  `[Undo]`, or immediately removed/re-added what the parse produced;
- **explicit**: a lightweight review loop (web admin table or a
  periodic bot DM digest) where a human confirms/fixes the label for
  traces the implicit signals can't settle.

An export command turns confirmed traces into fixture files in the
r3 kit format (`spikes/r3-nlu-bakeoff/fixtures-*.json`), so the
bake-off harness doubles as the regression eval over real usage —
and, once volume exists, as training data for the deferred
fine-tuning decision (r3 findings: LoRA "not until R6 live data
exists" — this plan is what makes that data exist).

## Non-goals

- No automatic retraining/fine-tuning in this plan — capture and
  labelling only; training is a later plan gated on dataset size.
- No storage of messages the parser never saw (allow-list rejects
  stay unlogged — privacy default).
- No free-text PII beyond what the household already sends the bot;
  traces live in the same household-scoped RLS as the rest of P4.

## Context

Inherited (p4-03 round 2, 2026-08-27): `plan_set_storkok` added a
line to `CLASSIFY_PROMPT` + a slot spec, but the LLM-path fixture
rerun couldn't happen off-M1 (no Ollama). Every known phrasing is
rules-claimed, so the LLM path is unexercised in practice — rerun
the two-stage fixture suite against qwen3:8b on the M1 as part of
this plan's first eval pass.

r3-runtime-model-bakeoff.md round 3: qwen3:8b + two-stage harness at
95–96 % with all residual misses being context/schema issues; the
honest eval ceiling is now real-usage data, which only this capture
loop can supply. The trace row should record `harness_version` +
`model` so accuracy can be compared across harness/model upgrades on
identical traffic. **Schema note: `nlu_traces` is a new table —
outside the approved p4-01 set, so it needs the ask-first spec
touch (AGENTS.md non-goals) before migration.**

## Progress

- [ ] `nlu_traces` schema approved (ask-first) + migrated
- [ ] Every parse writes a trace; corrections/undo link back
- [ ] Implicit labelling sweep running
- [ ] Review surface for unsettled traces live
- [ ] `export-fixtures` produces a real-usage eval the r3 kit runs

## Steps

1. Spec touch: approve the `nlu_traces` schema addition (ask-first
   per AGENTS.md), then the migration: utterance, parse json, model,
   harness_version, latency_ms, label enum
   (implicit_correct/implicit_wrong/confirmed_correct/
   confirmed_wrong/unsettled), label_source, corrected_parse json
   (the right answer when wrong), household-scoped RLS.
2. Bot: write a trace on every parse; `correct_last` and `[Undo]`
   handlers link to the trace they overturn → implicit-wrong with
   `corrected_parse` filled from the repair.
3. Implicit-correct sweep: nightly job labels uncorrected traces
   older than 48 h.
4. Review surface for unsettled traces — admin table or periodic bot
   DM digest; decide with the household, keep it one-tap.
5. `export-fixtures`: confirmed traces → r3-kit-format JSON
   (`spikes/r3-nlu-bakeoff/fixtures-live-<date>.json`); document
   running the bake-off runners against it as the regression eval.

## Verification

- `./harness check` passes (migration validated, unit tests on the
  labelling transitions: correction overturns, sweep respects the
  48 h window, export round-trips through the r3 scorer).
- Fixture replay: a scripted correct→corrected pair yields one
  implicit-wrong trace with the repair as `corrected_parse`.
- Live: after a week of household use, export produces a non-empty
  real-usage fixture file and the two-stage harness scores against
  it.

## Evidence

(recorded during implementation)
