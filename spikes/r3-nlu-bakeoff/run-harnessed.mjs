#!/usr/bin/env node
// R3 harness-layer experiment — spikes/r3-nlu-bakeoff (throwaway research code).
//
// Same fixtures and scorer as run.mjs, but wraps the model in a domain
// harness instead of a bare zero-shot prompt:
//   1. grammar-constrained decoding: Ollama native /api/chat `format` with a
//      JSON schema (malformed output becomes impossible; `day` is forced to
//      an English-weekday enum at the decoder);
//   2. few-shot examples targeting the trap categories every model failed in
//      the baseline runs (paraphrased — NOT the fixture sentences);
//   3. `think: false` (BAKEOFF_THINK=false) to actually disable qwen3-class
//      thinking, which the OpenAI-compat endpoint cannot do;
//   4. a deterministic post-processor (Swedish→English weekday map, empty
//      optional keys dropped, numeric coercion).
//
// Ollama native API only (that is the harness's target runtime).
// Usage:
//   BAKEOFF_MODEL=qwen2.5:7b node run-harnessed.mjs --out results-h-qwen25-7b.json
//   BAKEOFF_THINK=false BAKEOFF_MODEL=qwen3:8b node run-harnessed.mjs ...

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixIdx = process.argv.indexOf("--fixtures");
const FIXFILE = fixIdx > -1 ? process.argv[fixIdx + 1] : "fixtures.json";
const fixtures = JSON.parse(readFileSync(join(here, FIXFILE), "utf8"));

const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : null;
const URL_BASE = process.env.BAKEOFF_URL ?? "http://localhost:11434";
const MODEL = process.env.BAKEOFF_MODEL;
if (!MODEL) {
  console.error("Set BAKEOFF_MODEL (e.g. qwen2.5:7b)");
  process.exit(1);
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const SCHEMA = {
  type: "object",
  properties: {
    intent: {
      enum: ["add_item", "remove_item", "check_item", "show_list", "correct_last",
             "set_preference", "query_tonight", "plan_draft", "plan_set_day",
             "plan_set_multiplier", "plan_lock", "note_recipe", "chitchat"],
    },
    items: { type: "array", items: { type: "string" } },
    quantity: { type: "string" },
    note: { type: "string" },
    context: { type: "string" },
    query: { type: "string" },
    replacement: { type: "string" },
    ingredient: { type: "string" },
    product: { type: "string" },
    day_offset: { type: "integer" },
    horizon: { type: "string" },
    day: { enum: DAYS },
    recipe_query: { type: "string" },
    multiplier: { type: "integer" },
  },
  required: ["intent"],
};

const SYSTEM_PROMPT = `You parse ONE message from a Swedish/English vegan household
meal-planning chat into ONE JSON intent object. Include only the keys that
apply. Intents:
add_item (items, quantity?, note?, context?) · remove_item (items) ·
check_item (items — mark as bought/done, e.g. "bocka av") ·
show_list (query? — any question about what is on the list or at home,
e.g. "har vi X hemma?") · correct_last (replacement — user corrects their
previous message) · set_preference (ingredient, product — household switched
brand/product for an ingredient) · query_tonight (day_offset? 0=today 1=tomorrow) ·
plan_draft (horizon?) · plan_set_day (day, recipe_query) ·
plan_set_multiplier (day, multiplier) · plan_lock · note_recipe (note —
feedback/adjustment about a dish for next time) · chitchat (greetings, thanks,
no action).
Rules: items lowercase singular-ish Swedish when the user wrote Swedish; fix
missing diacritics ("mjolk" -> "mjölk"); "köp inte mer X" / "sluta köp X" =
remove_item; days and horizon ALWAYS as English weekday names; asking whether
something is at home is show_list with query, never check_item; when unsure,
prefer chitchat over guessing a destructive action.`
  // BAKEOFF_FEWSHOT=v2: disambiguation rules for the day-mention trap.
  + (process.env.BAKEOFF_FEWSHOT === "v2" ? `
Disambiguation: needing/buying an ITEM for a day ("vi behöver X till på
lördag") is add_item with note = the day — never a plan intent.
plan_set_day only changes which DISH is cooked on a day (byt/kör/change
DAY to DISH). plan_draft is about planning days ahead (planera), even
without an explicit horizon. "har vi X (kvar/hemma)?" and "står X på
listan?" are always show_list with query=X.` : "");

// Few-shot pairs covering the baseline-run trap categories, paraphrased so no
// fixture utterance appears verbatim.
const FEW_SHOT = [
  ["har vi pasta hemma?", { intent: "show_list", query: "pasta" }],
  ["bocka av tomaterna", { intent: "check_item", items: ["tomat"] }],
  ["vi kör alpro istället för arla nu", { intent: "set_preference", ingredient: "mjölk", product: "alpro" }],
  ["lite mindre salt nästa gång", { intent: "note_recipe", note: "mindre salt" }],
  ["nej jag menade fusilli", { intent: "correct_last", replacement: "fusilli" }],
  ["sluta köp bananer", { intent: "remove_item", items: ["bananer"] }],
  ["byt onsdag till soppa", { intent: "plan_set_day", day: "wednesday", recipe_query: "soppa" }],
  ["planera fram till fredag", { intent: "plan_draft", horizon: "friday" }],
  ["kop agg", { intent: "add_item", items: ["ägg"] }],
  // v2 additions: the day-mention trap and a bare planning ask.
  ...(process.env.BAKEOFF_FEWSHOT === "v2" ? [
    ["vi behöver persilja till på torsdag", { intent: "add_item", items: ["persilja"], note: "torsdag" }],
    ["ska vi planera lite dagar framåt?", { intent: "plan_draft" }],
  ] : []),
];

const DAY_MAP = {
  "måndag": "monday", "tisdag": "tuesday", "onsdag": "wednesday", "torsdag": "thursday",
  "fredag": "friday", "lördag": "saturday", "söndag": "sunday",
  "mandag": "monday", "lordag": "saturday", "sondag": "sunday",
};

function postProcess(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === "" || v == null || (Array.isArray(v) && v.length === 0)) delete obj[k];
  }
  for (const k of ["day", "horizon"]) {
    if (typeof obj[k] === "string") {
      const low = obj[k].toLowerCase().trim();
      obj[k] = DAY_MAP[low] ?? low;
    }
  }
  for (const k of ["day_offset", "multiplier"]) {
    if (typeof obj[k] === "string" && obj[k].match(/^\d+$/)) obj[k] = Number(obj[k]);
  }
  return obj;
}

async function askLLM(utterance) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...FEW_SHOT.flatMap(([u, a]) => [
      { role: "user", content: u },
      { role: "assistant", content: JSON.stringify(a) },
    ]),
    { role: "user", content: utterance },
  ];
  const body = {
    model: MODEL,
    stream: false,
    messages,
    format: SCHEMA,
    options: { temperature: 0 },
  };
  if (process.env.BAKEOFF_THINK === "false") body.think = false;
  const t0 = performance.now();
  const res = await fetch(`${URL_BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { text: data.message.content, ms: performance.now() - t0 };
}

// --- scorer: identical to run.mjs ---
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
    const { text, ms } = await askLLM(fixture.utterance);
    const parsed = extractJSON(text);
    row.ms = Math.round(ms);
    row.raw = text;
    if (!parsed) {
      row.outcome = "malformed";
    } else {
      row.parsed = postProcess(parsed);
      const intentOK = row.parsed.intent === fixture.expect.intent;
      const slotKeys = Object.keys(fixture.expect).filter((k) => k !== "intent");
      const slotsOK = slotKeys.every((k) => slotMatch(fixture.expect[k], row.parsed[k]));
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
  harness: "few-shot + schema-constrained decoding + post-processing",
  fewshot: process.env.BAKEOFF_FEWSHOT ?? "v1", fixtures: FIXFILE,
  model: MODEL, url: URL_BASE, think: process.env.BAKEOFF_THINK ?? "default",
  total: results.length,
  pass: count("pass"), intentOnly: count("intent-only"), fail: count("fail"),
  malformed: count("malformed"), error: count("error"),
  latencyMs: { p50: pct(50), p95: pct(95) },
};
console.log("\n== summary ==", JSON.stringify(summary, null, 2));
if (OUT) {
  writeFileSync(join(here, OUT), JSON.stringify({ summary, results }, null, 2));
  console.log(`report written to ${join(here, OUT)}`);
}
