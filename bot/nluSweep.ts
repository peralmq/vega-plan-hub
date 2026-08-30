// Step 3: the nightly implicit-correct sweep — a standalone script, not part
// of the always-on consumer loop (a 48h-old trace does not need real-time
// attention). Run on the M1 via cron:
//   0 4 * * * cd /path/to/checkout && npx tsx bot/nluSweep.ts >> nlu-sweep.log
//
// The window logic itself is pure and tested without a database
// (src/lib/nluTraces.ts, isSweepEligible/sweepImplicitCorrect); this file is
// only the query-then-update round trip against it, scoped to one household.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sweepImplicitCorrect } from "../src/lib/nluTraces";
import { loadConfig } from "./env";

export async function runSweepOnce(
  supa: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<{ scanned: number; swept: string[] }> {
  const { data, error } = await supa
    .from("nlu_traces")
    .select("id, label, created_at")
    .eq("user_id", userId)
    .eq("label", "unsettled");
  if (error) throw new Error(`nlu_traces scan failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; label: "unsettled"; created_at: string }>;
  const swept = sweepImplicitCorrect(rows, now);
  if (swept.length > 0) {
    const { error: updateError } = await supa
      .from("nlu_traces")
      .update({ label: "implicit_correct", label_source: "sweep", labelled_at: now.toISOString() })
      .in("id", swept);
    if (updateError) throw new Error(`nlu_traces sweep update failed: ${updateError.message}`);
  }
  return { scanned: rows.length, swept };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const supa = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const { error } = await supa.auth.signInWithPassword({
    email: cfg.householdEmail,
    password: cfg.householdPassword,
  });
  if (error) throw new Error(`household sign-in failed: ${error.message}`);
  const { data: userData } = await supa.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("no signed-in user id after sign-in");

  const { scanned, swept } = await runSweepOnce(supa, userId);
  console.log(`[nlu-sweep] ${new Date().toISOString()} scanned=${scanned} swept=${swept.length}`);
}

// Only run main() when this file is invoked directly (tsx bot/nluSweep.ts),
// not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[nlu-sweep] fatal:", err);
    process.exit(1);
  });
}
