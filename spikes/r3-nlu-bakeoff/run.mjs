#!/usr/bin/env node
// R3 NLU bake-off runner — spikes/r3-nlu-bakeoff (throwaway research code).
// Sends every fixture utterance to an OpenAI-compatible /chat/completions
// endpoint (Ollama, TurboFieldfare server, LM Studio, or a hosted API) and
// scores intent accuracy, slot accuracy, malformed-JSON rate, and latency.
//
// Usage:
//   node run.mjs --mock                        # self-test the harness, no LLM
//   BAKEOFF_URL=http://localhost:11434/v1 BAKEOFF_MODEL=qwen3:8b node run.mjs
//   BAKEOFF_KEY=... BAKEOFF_URL=https://api.anthropic.com/v1 ... (hosted baseline)
//   node run.mjs --out results-qwen3-8b.json   # also write a JSON report

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, "fixtures.json"), "utf8"));

const MOCK = process.argv.includes("--mock");
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : null;
const URL_BASE = process.env.BAKEOFF_URL ?? "http://localhost:11434/v1";
const MODEL = process.env.BAKEOFF_MODEL ?? (MOCK ? "mock" : null);
if (!MODEL) {
  console.error("Set BAKEOFF_MODEL (e.g. qwen3:8b) or use --mock");
  process.exit(1);
}

const SYSTEM_PROMPT = `You are the intent parser for a vegan household meal-planning
assistant on Telegram. The household writes in Swedish or English, often
sloppily typed. Convert ONE message into ONE JSON object and output
NOTHING else — no prose, no markdown fences.

Schema — exactly one of these intents, with only the listed keys:
  {"intent":"add_item","items":["..."],"quantity":"...","note":"...","context":"..."}   // quantity/note/context optional
  {"intent":"remove_item","items":["..."]}
  {"intent":"check_item","items":["..."]}
  {"intent":"show_list","query":"..."}                                                  // query optional
  {"intent":"correct_last","replacement":"..."}
  {"intent":"set_preference","ingredient":"...","product":"..."}
  {"intent":"query_tonight","day_offset":0}                                             // day_offset optional, integer
  {"intent":"plan_draft","horizon":"..."}                                               // horizon optional
  {"intent":"plan_set_day","day":"monday|...|sunday","recipe_query":"..."}
  {"intent":"plan_set_multiplier","day":"monday|...|sunday","multiplier":2}
  {"intent":"plan_lock"}
  {"intent":"note_recipe","note":"..."}
  {"intent":"chitchat"}                                                                 // greetings/thanks/anything with no action

Rules: normalize items to lowercase singular-ish Swedish where the user
wrote Swedish (fix missing diacritics: "mjolk" -> "mjölk"); "köp inte
mer X" means remove_item, not add_item; when unsure, prefer chitchat
over guessing a destructive action.`
  // BAKEOFF_NOTHINK=1: soft-switch off Qwen3's thinking mode for a
  // latency-fair variant run (recorded separately in the findings).
  + (process.env.BAKEOFF_NOTHINK ? "\n/no_think" : "");

async function askLLM(utterance) {
  const t0 = performance.now();
  const res = await fetch(`${URL_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.BAKEOFF_KEY ? { authorization: `Bearer ${process.env.BAKEOFF_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: utterance },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return { text: body.choices[0].message.content, ms: performance.now() - t0 };
}

function askMock(fixture) {
  // Echo the expectation back (validates plumbing + scorer = should score 100%).
  return { text: JSON.stringify(fixture.expect), ms: 1 };
}

function extractJSON(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  for (let end = text.length; end > start; end--) {
    try { return JSON.parse(text.slice(start, end)); } catch { /* shrink */ }
  }
  return null;
}

const norm = (s) => String(s).toLowerCase().trim();
function slotMatch(expected, actual) {
  if (Array.isArray(expected)) {
    const got = Array.isArray(actual) ? actual.map(norm) : [norm(actual ?? "")];
    return expected.every((e) => got.some((g) => g.includes(norm(e)) || norm(e).includes(g)));
  }
  if (typeof expected === "number") return Number(actual) === expected;
  return actual != null && (norm(actual).includes(norm(expected)) || norm(expected).includes(norm(actual)));
}

const results = [];
for (const fixture of fixtures) {
  let row = { utterance: fixture.utterance, expect: fixture.expect };
  try {
    const { text, ms } = MOCK ? askMock(fixture) : await askLLM(fixture.utterance);
    const parsed = extractJSON(text);
    row.ms = Math.round(ms);
    row.raw = text;
    if (!parsed) {
      row.outcome = "malformed";
    } else {
      row.parsed = parsed;
      const intentOK = parsed.intent === fixture.expect.intent;
      const slotKeys = Object.keys(fixture.expect).filter((k) => k !== "intent");
      const slotsOK = slotKeys.every((k) => slotMatch(fixture.expect[k], parsed[k]));
      row.outcome = intentOK && slotsOK ? "pass" : intentOK ? "intent-only" : "fail";
    }
  } catch (err) {
    row.outcome = "error";
    row.error = String(err.message ?? err);
  }
  results.push(row);
  const icon = { pass: "✅", "intent-only": "🟡", fail: "❌", malformed: "🧨", error: "💥" }[row.outcome];
  console.log(`${icon} ${row.outcome.padEnd(11)} ${String(row.ms ?? "-").padStart(6)}ms  ${fixture.utterance}`);
  if (row.outcome === "fail" || row.outcome === "intent-only")
    console.log(`     expected ${JSON.stringify(fixture.expect)} — got ${JSON.stringify(row.parsed)}`);
}

const count = (o) => results.filter((r) => r.outcome === o).length;
const lat = results.filter((r) => r.ms != null).map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))] ?? "-";
const summary = {
  model: MODEL, url: MOCK ? "mock" : URL_BASE, total: results.length,
  pass: count("pass"), intentOnly: count("intent-only"), fail: count("fail"),
  malformed: count("malformed"), error: count("error"),
  latencyMs: { p50: pct(50), p95: pct(95) },
};
console.log("\n== summary ==", JSON.stringify(summary, null, 2));
if (OUT) {
  writeFileSync(join(here, OUT), JSON.stringify({ summary, results }, null, 2));
  console.log(`report written to ${join(here, OUT)}`);
}
if (MOCK && (summary.pass !== summary.total)) {
  console.error("mock self-test FAILED — scorer or plumbing is broken");
  process.exit(1);
}
