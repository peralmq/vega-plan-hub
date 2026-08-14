# R3 — Runtime + model bake-off: Findings

Status: model bake-off complete incl. harness-layer and held-out
accuracy experiments, 2026-08-14 — **winning recipe: qwen3:8b +
two-stage harness, 96 %/95 %, zero wrong intents** (round 3 below). Spike R3 of
[telegram-pivot-research-plan.md](telegram-pivot-research-plan.md);
kit in [spikes/r3-nlu-bakeoff/](../../spikes/r3-nlu-bakeoff/README.md).
Run on the target machine itself: **M1 Pro, 16 GB, macOS 26.6.1**
(satisfies TurboFieldfare's macOS 26 / Metal 4 floor). Scorer
self-test (`--mock`): 24/24 before any live run. Raw per-utterance
transcripts: `spikes/r3-nlu-bakeoff/results-*.json`.

Scope note: this records the **model/NLU bake-off** (C.1). The runtime
shortlist strand (OpenClaw vs Letta vs lightweight vs custom on the
memory + sandbox criteria) is not covered here and remains open.

## Round 1 — bare zero-shot prompt (kit as staged)

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

## Round 2 — extended matrix + harness-layer experiment

Round 1's systematic-failure observation predicted the accuracy gap
was prompt/scaffolding-bound, not capacity-bound. Round 2 tested that
with a **domain harness** (`run-harnessed.mjs`, Ollama native API):

1. **Schema-constrained decoding** — Ollama `format` with a JSON
   schema: malformed output becomes structurally impossible and `day`
   is forced to an English-weekday enum at the decoder;
2. **Few-shot examples** — 9 user/assistant pairs covering exactly
   the round-1 trap categories, paraphrased (no fixture sentence
   appears verbatim);
3. **`think: false`** — the native-API switch that actually disables
   qwen3's thinking (the OpenAI-compat endpoint can't);
4. **Deterministic post-processing** — Swedish→English weekday map,
   empty-optional-key stripping, numeric coercion.

Plus three new M1-friendly candidates (dense Q4 / QAT variants that
fit 16 GB alongside an agent runtime). Same fixtures, same scorer:

| Model | baseline pass | harnessed pass | harnessed p50 / p95 |
| --- | --- | --- | --- |
| **qwen3:8b (think:false)** | 16/24 † | **22/24 (92 %)** | **0.93 s / 1.38 s** |
| gemma3:12b-it-qat | 13/24 | 22/24 (92 %) | 4.3 s / 5.4 s |
| qwen2.5:7b | 14/24 | 20/24 (+2 intent-only) | 0.84 s / 1.2 s |
| llama3.1:8b | 19/24 | 19/24 (+1) | 0.99 s / 1.7 s |
| llama3.2:3b | 10/24 | 13/24 | 0.50 s / 0.90 s |

† round-1 baseline, thinking hidden but active (p50 19 s).
Malformed: 0 everywhere (constrained decoding guarantees it in the
harnessed runs). Raw transcripts: `results-h-*.json`.

**qwen3:8b + harness passes the decision rule**: 92 % ≥ ~90 %,
malformed 0 ≤ ~5 %, p95 1.38 s ≪ 3–4 s. `think:false` collapsed its
latency from p50 19 s to 0.93 s at top-of-field accuracy. Notable:

- The harness lift is model-dependent: large where multilingual
  instruction-following is strong (gemma3 +9, qwen2.5 +6/+8), ~zero
  for llama3.1 (fixed the old traps, invented new day-related ones).
- Both 92 %-models miss the **same last fixture**: "vi behöver
  citroner till på lördag" → `plan_set_day` instead of
  `add_item`+note — genuinely ambiguous phrasing; a candidate for a
  clarify-in-chat flow rather than more prompt surgery. The remaining
  intent-only is a `note` vs `context` key choice with correct
  content (scorer strictness, not model error).
- Honesty caveat: the few-shot examples target trap *categories*
  discovered on this same fixture set (paraphrased, never verbatim).
  Real-household utterances (R6) are the uncontaminated test.

## Round 3 — held-out set + accuracy push on qwen3:8b

Round 2's caveat (few-shot tuned on fixture-derived traps) demanded a
clean test before optimizing further. Round 3 added
`fixtures-heldout.json` — **44 fresh utterances** authored from the R1
scripts' domain (new items, phrasings, typos, code-switching; disjoint
from the original 24 and from every few-shot example) — and three
accuracy experiments on qwen3:8b (`think:false` throughout):

| Config (qwen3:8b) | original 24 | held-out 44 | fails | p95 |
| --- | --- | --- | --- | --- |
| one-shot harness v1 (round 2) | 22/24 | 41/44 | 1–2 | 1.4 s |
| one-shot harness v2 (+disambig rules) | 22/24 | 41/44 | 0–1 | 1.5 s |
| two-stage v1 (classify → extract) | 22/24 | 41/44 | **0** | 2.4 s |
| **two-stage v2 (+day override)** | **23/24 (96 %)** | **42/44 (95 %)** | **0** | **2.3 s** |
| two-stage v2 on qwen3:14b | 23/24 | 41/44 | 0 | 4.1 s |

- **The round-2 winner generalizes**: harness v1 scored 93 % on the
  held-out set it was never tuned toward — the contamination worry
  did not materialize.
- **Two-stage** (`run-twostage.mjs`: stage 1 classifies intent
  against a bare 13-value enum; stage 2 extracts slots with an
  intent-specific schema and micro-prompt) reached **100 % intent
  accuracy on all 68 fixtures** — every residual miss is a slot
  detail, never a wrong action. Cost: two sequential calls, p95
  2.3 s — still under the bar.
- **Two-stage v2** adds a deterministic weekday override: models
  false-friend Swedish weekdays under the English enum
  ("torsdag" → `tuesday`), but the weekday is regexable from the
  utterance, so post-processing overrides it. This is the harness
  thesis working: every deterministic sub-problem removed from the
  model converts an error class to zero.
- **qwen3:14b is not worth it**: no accuracy gain, ~2× latency, and
  one hallucinated slot (echoed a prompt example). Per-call search
  space beat parameter count.

The three residual intent-only misses are not model-capability
problems: (1) "oatly → mjölk" ingredient inference needs the
household preference table in the prompt — a production feature the
real bot gets for free; (2) `note` vs `context` key choice — content
is always right; recommend merging them into one `note` field in the
P4 schema; (3) unrepaired diacritics on one typo'd multi-item row —
production catalog fuzzy-matching territory.

**Fine-tuning verdict: not now.** At 95–96 % with zero intent errors,
the remaining misses are context/schema/product issues that LoRA
cannot fix better than the harness already does. Revisit only if R6's
live week surfaces error classes the harness can't absorb (training
data would then exist for free in the transcripts).

## Gate input

- **Track B has a working local recipe: qwen3:8b via Ollama + the
  two-stage domain harness** — 96 % / 95 % (original / held-out),
  **zero wrong intents in 68 fixtures**, structurally-guaranteed
  JSON, p95 2.3 s, 5.6 GB resident (10 GB headroom on the 16 GB M1).
  The harness pattern (enum classify → per-intent constrained
  extract → deterministic post-process) is exactly the P4
  assistant's parser seam; qwen2.5:7b is a same-shape fallback and
  the one-shot harness (p95 1.4 s) the low-latency variant. R6
  (sandboxed live week) is unblocked.
- **TurboFieldfare** is out for the chat path despite best zero-shot
  accuracy and a superb memory story (~1 GB): no prompt caching +
  ~2 tok/s decode on the M1 ⇒ ~13 s replies, and no constrained
  decoding to harden JSON. Reconsider only if RAM pressure forces
  model + runtime co-residency trade-offs.
- **Hosted baseline not run** (no API key handled in this session).
  One command, any OpenAI-compatible endpoint:

  ```bash
  cd spikes/r3-nlu-bakeoff && BAKEOFF_URL=<endpoint>/v1 BAKEOFF_KEY=<key> BAKEOFF_MODEL=<model> node run.mjs --out results-hosted.json
  ```

## Kit changes across the three rounds

- `run.mjs`: opt-in `BAKEOFF_NOTHINK=1` appends qwen3's `/no_think`
  soft switch (round 1; ineffective — kept for the record). Mock
  self-test re-verified 24/24 after the change.
- `run-harnessed.mjs` (rounds 2–3): the one-shot domain-harness
  runner; `--fixtures <file>`, `BAKEOFF_FEWSHOT=v2` for the
  disambiguation-rules variant. Ollama native API only.
- `run-twostage.mjs` (round 3): two-stage runner (enum classify →
  per-intent extract) with the deterministic weekday override.
- `fixtures-heldout.json` (round 3): 44 held-out fixtures.
- Committed result reports for all twenty live runs
  (`results-*.json`).
