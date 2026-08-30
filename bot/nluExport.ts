// Step 5: `export-fixtures` — confirmed nlu_traces → r3-kit-format JSON, so
// the bake-off harness (spikes/r3-nlu-bakeoff/run.mjs) doubles as the
// regression eval over real household usage. Run on the M1:
//   npx tsx bot/nluExport.ts
// then score it:
//   cd spikes/r3-nlu-bakeoff && BAKEOFF_MODEL=qwen3:8b node run-twostage.mjs \
//     --fixtures fixtures-live-<date>.json
// (or `node run.mjs --mock --fixtures fixtures-live-<date>.json` to just
// check the file's shape without calling a model).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportFixtures, type FixtureEntry } from "../src/lib/nluTraces";
import { loadConfig } from "./env";

const R3_KIT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "spikes", "r3-nlu-bakeoff");

export async function fetchConfirmedTraces(
  supa: SupabaseClient,
  userId: string,
): Promise<FixtureEntry[]> {
  const { data, error } = await supa
    .from("nlu_traces")
    .select("utterance, parse, label, corrected_parse")
    .eq("user_id", userId)
    .in("label", ["confirmed_correct", "confirmed_wrong"]);
  if (error) throw new Error(`nlu_traces export query failed: ${error.message}`);
  return exportFixtures(
    (data ?? []) as Array<{
      utterance: string;
      parse: FixtureEntry["expect"];
      label: "confirmed_correct" | "confirmed_wrong";
      corrected_parse: FixtureEntry["expect"] | null;
    }>,
  );
}

export function fixturesFilePath(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10); // yyyy-mm-dd, matches localIsoDate's shape
  return join(R3_KIT_DIR, `fixtures-live-${iso}.json`);
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

  const fixtures = await fetchConfirmedTraces(supa, userId);
  if (fixtures.length === 0) {
    console.log("[nlu-export] no confirmed traces yet — nothing written");
    return;
  }
  const outPath = fixturesFilePath();
  writeFileSync(outPath, JSON.stringify(fixtures, null, 2) + "\n");
  console.log(`[nlu-export] wrote ${fixtures.length} fixtures to ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[nlu-export] fatal:", err);
    process.exit(1);
  });
}
