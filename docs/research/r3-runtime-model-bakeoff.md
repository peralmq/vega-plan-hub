# R3 — Runtime + model bake-off: Findings

Status: model bake-off complete, 2026-08-14. Spike R3 of
[telegram-pivot-research-plan.md](telegram-pivot-research-plan.md);
kit in [spikes/r3-nlu-bakeoff/](../../spikes/r3-nlu-bakeoff/README.md).
Run on the target machine itself: **M1 Pro, 16 GB, macOS 26.6.1**
(satisfies TurboFieldfare's macOS 26 / Metal 4 floor). Scorer
self-test (`--mock`): 24/24 before any live run. Raw per-utterance
transcripts: `spikes/r3-nlu-bakeoff/results-*.json`.

Scope note: this records the **model/NLU bake-off** (C.1). The runtime
shortlist strand (OpenClaw vs Letta vs lightweight vs custom on the
memory + sandbox criteria) is not covered here and remains open.

## Headline

**No candidate passes the decision rule as-is** (pass ≥ ~90 %,
malformed ≤ ~5 %, p95 ≲ 3–4 s) — but the failures split cleanly:
the 8B dense models fail on *accuracy* with fine latency, and
TurboFieldfare fails on *latency* with the best accuracy. Malformed
JSON — the risk the kit was built to measure — was **zero across all
72 live fixture runs**.

| Candidate | pass | intent-only | fail | 🧨 malformed | p50 | p95 | Memory while serving |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TurboFieldfare (Gemma 4 26B-A4B) | 17/24 | 4 | 3 | **0** | 13.0 s | 14.3 s | server ~0.9 GB RSS; 51 % system free |
| qwen3:8b (Ollama) | 16/24 | 3 | 5 | 0 | 19.0 s | 40.2 s | 5.6 GB resident; 29 % free |
| llama3.1:8b (Ollama) | 19/24 | 0 | 5 | 0 | **1.0 s** | **1.4 s** | 5.0 GB resident; 33 % free |
| Hosted baseline | — | — | — | — | — | — | not run (needs an API key; command below) |

## TurboFieldfare — the three C.1 risks, answered

- **(a) Swedish: no problem.** Handled sloppy Swedish, diacritic
  repair ("kop mjolk o brod" → mjölk/bröd), and negation ("köp inte
  mer kaffe" → remove). It even over-commits to Swedish: normalized
  "toilet paper and coffee" → "toalettpapper"/"kaffe" (scored
  intent-only under the kit's slot matcher, arguably fine behavior).
  Best intent-level accuracy of the field: 21/24.
- **(b) Structured output: prompt-and-parse held.** 0/24 malformed at
  temperature 0 — every reply was a bare, parseable JSON object. The
  no-constrained-decoding fear did not materialize on this task size.
- **(c) M1 compatibility: runs, but slowly.** Swift release build
  succeeded first try (~171 s); the ~14.3 GB `.gturbo` install
  streamed and hash-validated cleanly. Decode measured ≈ 2 tok/s —
  about half the M2's advertised 5–6 — and the server does **no
  prompt caching** (`cached_tokens: 0` on repeated identical calls),
  so every message re-prefills the ~400-token system prompt. Net:
  ~12–14 s per intent parse, uniformly. TTFT with a minimal system
  prompt is ~2 s, so most of the wall time is prefill + slow decode,
  not startup. The memory story is as advertised: ~0.9 GB server RSS
  vs 5+ GB for the dense 8B models.

  Server quirk for future runs: the model id is `gemma-4-26b-a4b-it`,
  not the `gemma4-26b-a4b` guessed in the kit README.

## Ollama candidates

- **qwen3:8b is disqualified by hidden thinking.** Ollama routes
  qwen3's reasoning tokens to a separate field (so content parses
  clean), but the time is still spent: p50 19 s, p95 40 s. The
  `/no_think` soft switch (added to the kit as `BAKEOFF_NOTHINK=1`)
  suppressed the visible block without recovering the time, and
  accuracy (16/24) trails llama anyway.
- **llama3.1:8b is the only candidate that *feels* chat-native**
  (p50 1.0 s / p95 1.4 s) and scored 19/24 (79 %) — short of the
  ~90 % bar.

## The accuracy gap is systematic, not random

All three models failed the **same traps**:

- "har vi vitlök hemma?" → `check_item` instead of
  `show_list` + query (all three);
- "bocka av spenaten" → `remove_item` instead of `check_item` (all
  three — "bocka av" isn't landing);
- `set_preference` / `note_recipe` utterances misrouted by everyone.

A zero-shot system prompt is the ceiling here: identical failures
across a 26B MoE and two 8B dense models point at the prompt, not
model capacity. Untested levers, in expected-impact order: few-shot
examples of exactly these traps; grammar-constrained JSON + native
tool calling (Ollama structured outputs — also de-risks malformed
output permanently); intent descriptions in Swedish.

## Gate input

- **Most promising Track B path:** llama3.1:8b-class via Ollama —
  latency already passes with headroom, memory fits, and the accuracy
  gap looks prompt-fixable (few-shot + constrained decoding). Worth
  one focused prompt-iteration round before the gate call if accuracy
  ≥ 90 % is a hard precondition.
- **TurboFieldfare** is viable only if ~13 s replies are acceptable
  household UX. Its RAM frugality (~1 GB vs 5 GB) matters if the
  household machine must run the agent runtime + model concurrently —
  but no prompt caching + 2 tok/s decode on the M1 is the killer for
  a chat surface today.
- **Hosted baseline not run** (no API key handled in this session).
  One command, any OpenAI-compatible endpoint:

  ```bash
  cd spikes/r3-nlu-bakeoff && BAKEOFF_URL=<endpoint>/v1 BAKEOFF_KEY=<key> BAKEOFF_MODEL=<model> node run.mjs --out results-hosted.json
  ```

## Kit changes in this run

- `run.mjs`: opt-in `BAKEOFF_NOTHINK=1` appends qwen3's `/no_think`
  soft switch to the system prompt (variant runs stay separate:
  `results-qwen3-8b-nothink.json`). Mock self-test re-verified 24/24
  after the change.
- Committed result reports for all four live runs.
