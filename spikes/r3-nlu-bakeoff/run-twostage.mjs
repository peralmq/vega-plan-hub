#!/usr/bin/env node
// R3 two-stage harness experiment — spikes/r3-nlu-bakeoff (throwaway).
//
// Stage 1: classify intent only (schema = a bare enum — the model literally
//          cannot answer anything but one of the 13 intents).
// Stage 2: extract slots with an intent-specific schema and an
//          intent-specific micro-prompt (skipped for slotless intents).
// Rationale: each call has a far smaller search space than the single-shot
// harness; cost is up to 2 sequential model calls per utterance.
//
// Usage:
//   BAKEOFF_MODEL=qwen3:8b BAKEOFF_THINK=false node run-twostage.mjs \
//     [--fixtures fixtures-heldout.json] [--out results-....json]

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
if (!MODEL) { console.error("Set BAKEOFF_MODEL"); process.exit(1); }

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const INTENTS = ["add_item", "remove_item", "check_item", "show_list", "correct_last",
  "set_preference", "query_tonight", "plan_draft", "plan_set_day",
  "plan_set_multiplier", "plan_lock", "note_recipe", "chitchat"];

const CLASSIFY_PROMPT = `Classify ONE message from a Swedish/English vegan household
meal-planning chat into exactly one intent:
add_item = put grocery item(s) on the shopping list (incl. "vi behöver X",
  even when a day is mentioned: "till på lördag" is just a note)
remove_item = take item(s) off the list ("ta bort", "skippa", "köp inte
  mer X", "vi behöver inte mer X")
check_item = mark item(s) as bought/done ("bocka av", "tog X nyss",
  "check off")
show_list = show the list or ask what is on it / at home ("har vi X
  hemma/kvar?", "står X på listan?")
correct_last = user corrects their own previous message ("nej, X",
  "jag menade X", "oj fel")
set_preference = household switched brand/product for an ingredient
  ("vi har bytt från X till Y", "vi tar X istället för Y nu")
query_tonight = ask what's for dinner (tonight or another day)
plan_draft = start planning days ahead ("planera", with/without horizon)
plan_set_day = change which DISH is cooked on a day ("byt DAG till DISH",
  "kör DISH på DAG istället")
plan_set_multiplier = scale a day's portions ("dubbla portioner på DAG")
plan_lock = lock the drafted days ("lås dagarna/veckan", "lock it in")
note_recipe = feedback/adjustment on a dish for next time ("mindre salt
  nästa gång")
chitchat = greetings/thanks/banter, no action.
When unsure, prefer chitchat over guessing a destructive action.`;

const SLOT_SPECS = {
  add_item: {
    prompt: `Extract slots for add_item. items: the grocery item(s), lowercase
singular-ish Swedish when the user wrote Swedish, fix missing diacritics
("mjolk" -> "mjölk"). quantity: only if a number/amount is stated. note: only
if a day/occasion is attached ("till på lördag" -> "lördag"). context: only if
a dish/purpose is attached ("till pannkakorna" -> "pannkakorna").`,
    schema: { items: { type: "array", items: { type: "string" } }, quantity: { type: "string" }, note: { type: "string" }, context: { type: "string" } },
    required: ["items"],
  },
  remove_item: {
    prompt: `Extract slots for remove_item. items: the item(s) to remove, lowercase Swedish, diacritics fixed.`,
    schema: { items: { type: "array", items: { type: "string" } } }, required: ["items"],
  },
  check_item: {
    prompt: `Extract slots for check_item. items: the item(s) marked as bought/done, lowercase singular-ish Swedish, diacritics fixed.`,
    schema: { items: { type: "array", items: { type: "string" } } }, required: ["items"],
  },
  show_list: {
    prompt: `Extract slots for show_list. query: the specific item asked about, if any ("har vi X hemma?" -> X). Omit for a plain "show the list".`,
    schema: { query: { type: "string" } }, required: [],
  },
  correct_last: {
    prompt: `Extract slots for correct_last. replacement: what the user now wants instead.`,
    schema: { replacement: { type: "string" } }, required: ["replacement"],
  },
  set_preference: {
    prompt: `Extract slots for set_preference. ingredient: the generic ingredient category the switch is about (e.g. oat-drink brands -> "mjölk"; cheese brands -> "ost"). product: the NEW product/brand.`,
    schema: { ingredient: { type: "string" }, product: { type: "string" } }, required: ["ingredient", "product"],
  },
  query_tonight: {
    prompt: `Extract slots for query_tonight. day_offset: 0 for today/tonight (or omit), 1 for tomorrow, etc.`,
    schema: { day_offset: { type: "integer" } }, required: [],
  },
  plan_draft: {
    prompt: `Extract slots for plan_draft. horizon: the end day as an ENGLISH weekday name, only if stated ("fram till söndag" -> "sunday").`,
    schema: { horizon: { type: "string" } }, required: [],
  },
  plan_set_day: {
    prompt: `Extract slots for plan_set_day. day: ENGLISH weekday name
(måndag=monday tisdag=tuesday onsdag=wednesday torsdag=thursday
fredag=friday lördag=saturday söndag=sunday). recipe_query: the dish.`,
    schema: { day: { enum: DAYS }, recipe_query: { type: "string" } }, required: ["day", "recipe_query"],
  },
  plan_set_multiplier: {
    prompt: `Extract slots for plan_set_multiplier. day: ENGLISH weekday name
(måndag=monday tisdag=tuesday onsdag=wednesday torsdag=thursday
fredag=friday lördag=saturday söndag=sunday). multiplier: the integer factor ("dubbla" -> 2, "tre gånger" -> 3).`,
    schema: { day: { enum: DAYS }, multiplier: { type: "integer" } }, required: ["day", "multiplier"],
  },
  plan_lock: null,
  note_recipe: {
    prompt: `Extract slots for note_recipe. note: the adjustment, concise ("mindre stark nästa gång bara" -> "mindre stark").`,
    schema: { note: { type: "string" } }, required: ["note"],
  },
  chitchat: null,
};

const DAY_MAP = {
  "måndag": "monday", "tisdag": "tuesday", "onsdag": "wednesday", "torsdag": "thursday",
  "fredag": "friday", "lördag": "saturday", "söndag": "sunday",
  "mandag": "monday", "lordag": "saturday", "sondag": "sunday",
};
// Weekdays are deterministic from the utterance text — if exactly one weekday
// is mentioned, it overrides whatever the model put in day/horizon. (LLMs
// false-friend Swedish weekdays: torsdag -> "tuesday".)
function daysInText(utterance) {
  const low = utterance.toLowerCase();
  const found = new Set();
  for (const [sv, en] of Object.entries(DAY_MAP)) if (low.includes(sv)) found.add(en);
  for (const en of DAYS) if (low.includes(en)) found.add(en);
  return [...found];
}
function postProcess(obj, utterance) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === "" || v == null || (Array.isArray(v) && v.length === 0)) delete obj[k];
  }
  for (const k of ["day", "horizon"]) {
    if (typeof obj[k] === "string") { const low = obj[k].toLowerCase().trim(); obj[k] = DAY_MAP[low] ?? low; }
  }
  const days = daysInText(utterance);
  if (days.length === 1) {
    for (const k of ["day", "horizon"]) if (obj[k] != null && obj[k] !== days[0]) obj[k] = days[0];
  }
  for (const k of ["day_offset", "multiplier"]) {
    if (typeof obj[k] === "string" && obj[k].match(/^\d+$/)) obj[k] = Number(obj[k]);
  }
  return obj;
}

async function chat(system, user, format) {
  const body = { model: MODEL, stream: false, format, options: { temperature: 0 },
    messages: [{ role: "system", content: system }, { role: "user", content: user }] };
  if (process.env.BAKEOFF_THINK === "false") body.think = false;
  const res = await fetch(`${URL_BASE}/api/chat`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).message.content;
}

async function askTwoStage(utterance) {
  const t0 = performance.now();
  const stage1 = await chat(CLASSIFY_PROMPT, utterance,
    { type: "object", properties: { intent: { enum: INTENTS } }, required: ["intent"] });
  const intent = JSON.parse(stage1).intent;
  const spec = SLOT_SPECS[intent];
  let parsed = { intent };
  if (spec) {
    const stage2 = await chat(spec.prompt, utterance,
      { type: "object", properties: spec.schema, required: spec.required });
    parsed = { intent, ...JSON.parse(stage2) };
  }
  return { parsed, ms: performance.now() - t0 };
}

// --- scorer: identical to run.mjs ---
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
    const { parsed, ms } = await askTwoStage(fixture.utterance);
    row.ms = Math.round(ms);
    row.parsed = postProcess(parsed, fixture.utterance);
    const intentOK = row.parsed.intent === fixture.expect.intent;
    const slotKeys = Object.keys(fixture.expect).filter((k) => k !== "intent");
    const slotsOK = slotKeys.every((k) => slotMatch(fixture.expect[k], row.parsed[k]));
    row.outcome = intentOK && slotsOK ? "pass" : intentOK ? "intent-only" : "fail";
  } catch (err) {
    row.outcome = "error";
    row.error = String(err.message ?? err);
  }
  results.push(row);
  const icon = { pass: "✅", "intent-only": "🟡", fail: "❌", error: "💥" }[row.outcome];
  console.log(`${icon} ${row.outcome.padEnd(11)} ${String(row.ms ?? "-").padStart(6)}ms  ${fixture.utterance}`);
  if (row.outcome === "fail" || row.outcome === "intent-only")
    console.log(`     expected ${JSON.stringify(fixture.expect)} — got ${JSON.stringify(row.parsed)}`);
}

const count = (o) => results.filter((r) => r.outcome === o).length;
const lat = results.filter((r) => r.ms != null).map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))] ?? "-";
const summary = {
  harness: "two-stage: enum classify -> per-intent slot extract",
  fixtures: FIXFILE, model: MODEL, url: URL_BASE, think: process.env.BAKEOFF_THINK ?? "default",
  total: results.length,
  pass: count("pass"), intentOnly: count("intent-only"), fail: count("fail"),
  malformed: 0, error: count("error"),
  latencyMs: { p50: pct(50), p95: pct(95) },
};
console.log("\n== summary ==", JSON.stringify(summary, null, 2));
if (OUT) {
  writeFileSync(join(here, OUT), JSON.stringify({ summary, results }, null, 2));
  console.log(`report written to ${join(here, OUT)}`);
}
