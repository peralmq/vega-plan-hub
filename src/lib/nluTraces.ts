// Pure core of the NLU trace-capture loop (p4-06, docs/execplans/
// p4-06-nlu-trace-capture.md): every message the assistant parses becomes a
// labelled datapoint. This module decides WHAT to write and WHICH rows a
// state transition applies to; it never talks to Supabase or Telegram —
// bot/nluTrace.ts, bot/nluSweep.ts and bot/nluExport.ts do the actual round
// trips against what this returns (same split as productPreferences.ts).

import type { ParsedUtterance } from "./intentParser";

export type NluLabel =
  | "unsettled"
  | "implicit_correct"
  | "implicit_wrong"
  | "confirmed_correct"
  | "confirmed_wrong";

export type NluLabelSource = "correction" | "sweep" | "review";

export interface NluTraceInsert {
  user_id: string;
  chat_id: number;
  utterance: string;
  parse: ParsedUtterance;
  model: string;
  harness_version: string;
  latency_ms: number;
  label: "unsettled";
  label_source: null;
  corrected_parse: null;
}

export interface NluTraceRow {
  id: string;
  user_id: string;
  chat_id: number;
  utterance: string;
  parse: ParsedUtterance;
  model: string;
  harness_version: string;
  latency_ms: number;
  label: NluLabel;
  label_source: NluLabelSource | null;
  corrected_parse: ParsedUtterance | null;
  created_at: string;
  labelled_at: string | null;
}

// Every parse writes exactly one row, unsettled until something narrows it
// down (a correction, the 48h sweep, or a human review tap).
export function buildTraceInsert(params: {
  userId: string;
  chatId: number;
  utterance: string;
  parse: ParsedUtterance;
  model: string;
  harnessVersion: string;
  latencyMs: number;
}): NluTraceInsert {
  return {
    user_id: params.userId,
    chat_id: params.chatId,
    utterance: params.utterance,
    parse: params.parse,
    model: params.model,
    harness_version: params.harnessVersion,
    latency_ms: params.latencyMs,
    label: "unsettled",
    label_source: null,
    corrected_parse: null,
  };
}

export interface LabelPatch {
  label: NluLabel;
  label_source: NluLabelSource;
  corrected_parse: ParsedUtterance | null;
}

// `correct_last` ("nej, penne") overturns the trace behind the insert it
// just corrected: the original parse stood, so it was implicit-wrong, and
// the repair — what add_item should have produced — is the corrected_parse
// a fixture export can round-trip.
export function planCorrectionOverturn(correctedParse: ParsedUtterance): LabelPatch {
  return { label: "implicit_wrong", label_source: "correction", corrected_parse: correctedParse };
}

// A human review tap ([✅ rätt] / [❌ fel] on `/traces`) confirms or
// overturns an unsettled trace directly. Confirming never invents a
// corrected_parse; overturning without one just marks the trace unusable
// for export (exportFixtures below skips it) rather than guessing.
export function planReviewLabel(verdict: "correct" | "wrong"): LabelPatch {
  return {
    label: verdict === "correct" ? "confirmed_correct" : "confirmed_wrong",
    label_source: "review",
    corrected_parse: null,
  };
}

// The nightly sweep (Step 3): traces nobody corrected and nobody reviewed,
// once they are old enough that a correction would surely have arrived by
// now, default to implicit-correct — silence reads as "the action stood".
// Pure predicate so the 48h boundary is tested without a database.
export function isSweepEligible(
  trace: { label: NluLabel; created_at: string },
  now: Date,
  windowHours = 48,
): boolean {
  if (trace.label !== "unsettled") return false;
  const ageMs = now.getTime() - new Date(trace.created_at).getTime();
  return ageMs >= windowHours * 60 * 60 * 1000;
}

export function sweepImplicitCorrect(
  traces: Array<{ id: string; label: NluLabel; created_at: string }>,
  now: Date,
  windowHours = 48,
): string[] {
  return traces.filter((t) => isSweepEligible(t, now, windowHours)).map((t) => t.id);
}

// Step 5: confirmed traces → r3-kit fixture format (spikes/r3-nlu-bakeoff/
// fixtures.json shape: [{utterance, expect}]). Only the two REVIEW-confirmed
// labels are trustworthy enough for a regression fixture — confirmed_correct
// exports the parse as-is, confirmed_wrong exports its corrected_parse (a
// wrong trace with no fix recorded yet has nothing to export and is
// skipped, never a guess).
export interface FixtureEntry {
  utterance: string;
  expect: ParsedUtterance;
}

export function exportFixtures(
  traces: Array<Pick<NluTraceRow, "utterance" | "parse" | "label" | "corrected_parse">>,
): FixtureEntry[] {
  const out: FixtureEntry[] = [];
  for (const t of traces) {
    if (t.label === "confirmed_correct") {
      out.push({ utterance: t.utterance, expect: t.parse });
    } else if (t.label === "confirmed_wrong" && t.corrected_parse) {
      out.push({ utterance: t.utterance, expect: t.corrected_parse });
    }
  }
  return out;
}

// `/traces` review digest: one message per unsettled trace, Chat-voice
// styled (design.spec), one tap either way.
type Lang = "sv" | "en";
export function formatTraceReview(
  trace: { utterance: string; parse: ParsedUtterance },
  lang: Lang,
): string {
  const slots = Object.entries(trace.parse)
    .filter(([k]) => k !== "intent")
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  return lang === "sv"
    ? `🔎 "${trace.utterance}"\n→ ${trace.parse.intent}${slots ? ` (${slots})` : ""}\nStämmer det?`
    : `🔎 "${trace.utterance}"\n→ ${trace.parse.intent}${slots ? ` (${slots})` : ""}\nDid I get that right?`;
}
