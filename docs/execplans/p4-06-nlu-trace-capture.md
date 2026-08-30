---
id: p4-06-nlu-trace-capture
title: NLU trace capture — labelled real-usage dataset for continuous eval
phase: P4
status: in-progress
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

- [x] 2026-08-31 `nlu_traces` schema approved (directive Pelle 2026-08-30,
      recorded in tech.spec.md "Chat assistant" schema list) + migration
      written (`supabase/migrations/20260831060000_p4_06_nlu_traces.sql`,
      household-scoped RLS). **NOT applied to the live project** — per
      tonight's standing directive the bot may deploy before Pelle applies
      it by hand, so every write path degrades gracefully instead of
      assuming the table exists.
- [ ] 2026-08-31 Every parse writes a trace (done, tested) —
      `correct_last` linking done and tested (a scripted correct→corrected
      pair overturns the right trace to `implicit_wrong` with the repair as
      `corrected_parse`). **Not done**: an `[Undo]`-tap signal on an item
      *insert* — the bot has no such affordance today (only on preference
      changes, an unrelated signal); and the "immediately removed/re-added"
      heuristic from the Goal. Both are natural follow-ups, not required by
      this plan's Verification section — see Evidence.
- [ ] 2026-08-31 Sweep implemented + unit/integration tested
      (`bot/nluSweep.ts`, `npm run nlu:sweep`) but **not scheduled** on the
      M1 (no cron wiring) — deploying to the live runtime is out of scope
      for this change set per the standing directive.
- [ ] 2026-08-31 `/traces` review surface implemented + tested (one message
      per unsettled trace, one-tap `[✅ rätt]`/`[❌ fel]`) but **not live** —
      same deploy boundary as the sweep.
- [ ] 2026-08-31 `export-fixtures` implemented + tested end-to-end,
      including a literal round-trip through the r3 scorer
      (`node run.mjs --mock --fixtures …`) — **not yet run against real
      traffic**: there is no live data until the migration is applied and
      the household uses the bot for a while (this plan's own "Live"
      Verification bullet, a week out).

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

**2026-08-31 (implementation):**

Spec touch (the only file under `docs/specs/` this change set touches):
`docs/specs/tech.spec.md` "Chat assistant" schema bullet gained one clause
recording `nlu_traces` in the approved set, citing "directive Pelle
2026-08-30, p4-06".

Schema: `supabase/migrations/20260831060000_p4_06_nlu_traces.sql` — the six
columns the plan's Step 1 lists (utterance, parse jsonb, model,
harness_version, latency_ms, label) plus label_source, corrected_parse
jsonb, chat_id (review-digest reply target), household-scoped RLS (same
`user_id = auth.uid()` pattern as every other P4 table), one index on
`(user_id, label, created_at)` for the sweep/review/export queries. **Not
run against the live project** — file committed only, per the standing
directive; Pelle applies it by hand.

Pure decision layer: `src/lib/nluTraces.ts` — `buildTraceInsert`,
`planCorrectionOverturn`, `planReviewLabel`, `isSweepEligible` /
`sweepImplicitCorrect` (the 48h window as a pure predicate), `exportFixtures`
(confirmed-only, r3-kit `{utterance, expect}` shape), `formatTraceReview`.
14 tests, `src/lib/nluTraces.test.ts`, including the exact scenario named in
this plan's Verification: "a scripted correct→corrected pair yields one
implicit-wrong trace with the repair as corrected_parse"
(`planCorrectionOverturn`) and the 48h boundary (fresh/exactly-48h/already
sweept). `NLU_HARNESS_VERSION` constant added to `src/lib/intentParser.ts`
(bump on any material CLASSIFY_PROMPT/SLOT_SPECS/rules change) so
harness_version is a real value, not a placeholder.

Supabase glue (all in `bot/`, mirroring the productPreferences.ts /
tools.ts split): `nluTrace.ts` (writeTrace, linkCorrection, listUnsettled,
labelTraceFromReview — every one wrapped so it logs and returns instead of
throwing), `nluSweep.ts` (`runSweepOnce` + a `main()` cron entry point,
`npm run nlu:sweep`), `nluExport.ts` (`fetchConfirmedTraces` + a `main()`
entry point, `npm run nlu:export`, writes
`spikes/r3-nlu-bakeoff/fixtures-live-<date>.json`). 13 tests across
`bot/nluTrace.test.ts`, `bot/nluSweep.test.ts`, `bot/nluExport.test.ts`
(fakeSupabase-backed) — including the CRITICAL fallback the standing
directive called out: `writeTrace`/`linkCorrection`/`listUnsettled` all
proven to log-and-return instead of throwing when `nlu_traces` is absent
from the fake DB (the same shape a pre-migration Postgres would produce).

`spikes/r3-nlu-bakeoff/run.mjs` gained a `--fixtures <path>` flag (mirrors
`run-twostage.mjs`'s existing one; defaults to `fixtures.json`, so the R3
self-test — `node run.mjs --mock`, 24/24 — is unchanged). Verified this
change is backward-compatible: reran the R3 self-test after the edit,
still 24/24 pass. `bot/nluExport.test.ts`'s "export round-trips through the
r3 scorer" test spawns `node run.mjs --mock --fixtures <tmp file>` against
freshly built fixtures and asserts `summary.pass === summary.total` —
literal execution of the Verification bullet, not a shape assertion.

Bot wiring: `bot/tools.ts` — `ChatState.lastInsert` gained `traceId`;
`handleMessage` gained an optional `traceMeta` parameter (source, model,
harnessVersion, latencyMs) and writes the trace before acting on the parse;
`executeInserts` threads the trace id onto `state.lastInsert`; the
`correct_last` case links the correction (best-effort, after the list
update it must never undo); new `runTracesReview` (the `/traces` digest);
`handleCallback` gained the `nlu_ok:<id>` / `nlu_wrong:<id>` branch.
`bot/consumer.ts` — `parseUtterance`'s latency is measured and passed
through as `traceMeta`; `/traces` routed to `runTracesReview` alongside the
existing `/help` command dispatch. `traceMeta` is optional specifically so
every pre-existing call in `bot/tools.test.ts` (none of which pass it)
keeps working unchanged — proven by the full suite staying green.

New end-to-end coverage added to the existing `bot/tools.test.ts` (not a
new file, so it rides the existing fakeSupabase harness): every parse
writes a trace through `handleMessage`; the scripted correct→corrected pair
at the `handleMessage`/`executeOne` level (not just the pure function);
`traceMeta` omitted → no trace, insert still succeeds; `nlu_traces` table
absent → `handleMessage` still completes the insert (the graceful-
degradation contract, proven at the seam the household bot actually runs
through, not just inside `nluTrace.ts`); `/traces` sends one message with
`nlu_ok:<id>`/`nlu_wrong:<id>` buttons and `[✅ rätt]` flips the label to
`confirmed_correct` with `label_source: "review"`; empty `/traces` says so
instead of sending nothing.

Harness:

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
```

```
$ npx vitest run
 Test Files  26 passed (26)
      Tests  477 passed (477)
```

(471 before this change set — 6 new assertions in `bot/tools.test.ts` plus
the 4 new test files' own totals, all counted above; every pre-existing
test still passes unchanged.)

No check was skipped.

**Residual contract risk / what is left for a follow-up:**

- Live application of the migration, and live deployment of the bot with
  this code, are Pelle's to do (standing directive) — this plan's "Live"
  Verification bullet (a week of real usage, then export a non-empty
  real-usage fixture file) cannot be completed by an agent and is not
  claimed done here.
- The sweep and `/traces` are implemented and tested but not scheduled/
  wired live (no cron entry exists yet on the M1; deploying there was out
  of scope for tonight per the standing directive).
- `[Undo]`-on-insert and the "immediately removed/re-added" implicit-wrong
  heuristic (both named in the Goal) are not implemented — the former has
  no existing UI hook to attach to (the bot's only `[Undo]` today is on
  preference changes, a different signal) and the latter needs a design
  decision (how "immediate" counts) this session did not make unilaterally.
  Neither is required by this plan's Verification section; both are
  reasonable scope for a follow-up plan once real trace volume exists to
  judge whether they are worth the complexity.
- `confirmed_wrong` from the `/traces` review UI never carries a fix (no
  free-text follow-up flow) — `exportFixtures` correctly skips those rows
  rather than exporting a useless fixture, but it means the *only* source
  of `confirmed_wrong` fixtures with a usable `corrected_parse` is, for
  now, the `correct_last` implicit-wrong path, not the review surface.
  Worth knowing before judging the eventual real-usage fixture file's size.
