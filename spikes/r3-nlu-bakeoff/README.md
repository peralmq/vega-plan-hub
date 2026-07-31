# R3 bake-off kit — run this on the target M1 (16 GB)

Throwaway research code for spike R3 of
[../../docs/research/telegram-pivot-research-plan.md](../../docs/research/telegram-pivot-research-plan.md).
The dev machine used to build this kit is an **M3 Pro / 18 GB** — all
real numbers must come from the M1 itself.

Self-test (no LLM, verifies scorer + plumbing — passes 24/24):

```bash
node run.mjs --mock
```

## Candidate 1 — TurboFieldfare (Gemma 4 26B-A4B), user-preferred

Requires macOS 26 / Metal 4 — **first check is whether it runs on the
M1 at all** (validated upstream on M2 only). Install per
[github.com/drumih/turbo-fieldfare](https://github.com/drumih/turbo-fieldfare)
(~14.3 GB model download), start its OpenAI-compatible server
(experimental), then:

```bash
BAKEOFF_URL=http://localhost:8080/v1 BAKEOFF_MODEL=gemma4-26b-a4b node run.mjs --out results-turbofieldfare.json
```

## Candidates 2–3 — Ollama fallbacks (dense 8B class)

```bash
brew install ollama && ollama serve &
ollama pull qwen3:8b && ollama pull llama3.1:8b
BAKEOFF_MODEL=qwen3:8b   node run.mjs --out results-qwen3-8b.json
BAKEOFF_MODEL=llama3.1:8b node run.mjs --out results-llama31-8b.json
```

## Hosted baseline (calibrates the ceiling)

Any OpenAI-compatible endpoint: set `BAKEOFF_URL`, `BAKEOFF_KEY`,
`BAKEOFF_MODEL`.

## What to record in r3-runtime-model-bakeoff.md

Per model: pass / intent-only / fail / malformed counts, latency
p50/p95, and — while it runs — memory pressure (Activity Monitor) with
the model server resident. Decision rule from the research plan: a
model is viable when Swedish fixtures pass ≥ ~90 % with malformed ≤ ~5 %
and p95 latency feels chat-acceptable (≲ 3–4 s). The 🧨 malformed rate
matters most for TurboFieldfare (no native tool calling / constrained
decoding — prompt-and-parse only).
