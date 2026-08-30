// Supabase side of the trace-capture loop (p4-06): the pure decisions live in
// src/lib/nluTraces.ts; this file is only the round trip against them.
//
// CRITICAL degrade-gracefully contract (directive Pelle 2026-08-30): the
// migration for nlu_traces may not exist yet on whatever database this
// process is pointed at. Every function here MUST log and continue on
// failure — never throw, never block the message it was called alongside.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedUtterance } from "../src/lib/intentParser";
import {
  planCorrectionOverturn,
  planReviewLabel,
  type NluTraceInsert,
  type NluTraceRow,
} from "../src/lib/nluTraces";

function logSkip(op: string, err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err);
  console.error(`[nluTrace] ${op} skipped (degrading gracefully): ${reason}`);
}

// Called right after every parseUtterance — writes the row and returns its
// id (for correct_last to link back to later), or null on any failure. Never
// throws: a down/missing nlu_traces table must never stop the message the
// household is waiting on from being handled.
export async function writeTrace(
  supa: SupabaseClient,
  row: NluTraceInsert,
): Promise<string | null> {
  try {
    const { data, error } = await supa.from("nlu_traces").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  } catch (err) {
    logSkip("write", err);
    return null;
  }
}

// correct_last ("nej, penne") overturns the trace behind the insert it just
// corrected. Best-effort: the shopping-list correction itself (bot/tools.ts)
// has already succeeded by the time this runs and must not be undone by a
// labelling failure.
export async function linkCorrection(
  supa: SupabaseClient,
  traceId: string,
  correctedParse: ParsedUtterance,
): Promise<void> {
  try {
    const patch = planCorrectionOverturn(correctedParse);
    const { error } = await supa
      .from("nlu_traces")
      .update({ ...patch, labelled_at: new Date().toISOString() })
      .eq("id", traceId);
    if (error) throw new Error(error.message);
  } catch (err) {
    logSkip("linkCorrection", err);
  }
}

// `/traces` review digest (Step 4): the oldest `limit` unsettled traces for
// this household, oldest first (the ones most overdue for a look).
export async function listUnsettled(
  supa: SupabaseClient,
  userId: string,
  limit = 5,
): Promise<Array<Pick<NluTraceRow, "id" | "utterance" | "parse">>> {
  try {
    const { data, error } = await supa
      .from("nlu_traces")
      .select("id, utterance, parse")
      .eq("user_id", userId)
      .eq("label", "unsettled")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<Pick<NluTraceRow, "id" | "utterance" | "parse">>;
  } catch (err) {
    logSkip("listUnsettled", err);
    return [];
  }
}

// [✅ rätt] / [❌ fel] on a review digest message.
export async function labelTraceFromReview(
  supa: SupabaseClient,
  traceId: string,
  verdict: "correct" | "wrong",
): Promise<void> {
  try {
    const patch = planReviewLabel(verdict);
    const { error } = await supa
      .from("nlu_traces")
      .update({ ...patch, labelled_at: new Date().toISOString() })
      .eq("id", traceId);
    if (error) throw new Error(error.message);
  } catch (err) {
    logSkip("labelTraceFromReview", err);
  }
}
