// Minimal env loading for the compare CLI: reads compare/.env (KEY=VALUE
// lines, chmod 600 — store credentials never enter the repo; same pattern
// as bot/env.ts per the r6 runbook). All keys are optional here: missing
// credentials degrade the relevant store to a needs-auth delivery line.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function loadCompareEnv(): void {
  const envFile = join(dirname(fileURLToPath(import.meta.url)), ".env");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && process.env[m[1]] == null) process.env[m[1]] = m[2];
  }
}

// p5-05 `--batch`: household sign-in needs four more keys in this same
// compare/.env file — SUPABASE_URL, SUPABASE_ANON_KEY, HOUSEHOLD_EMAIL,
// HOUSEHOLD_PASSWORD (the exact bot/env.ts key names, so a value can be
// copied verbatim between the two files). Decision (recorded in the plan's
// Evidence): compare/.env grows these keys rather than compare/ reading
// bot/.env directly. tech.spec.md already documents compare/'s credentials
// as living in compare/.env "bot/.env pattern" — a same-shaped sibling
// file, not a shared one — and bot/ and compare/ are different processes
// with different lifecycles (a standing M1 daemon vs. an ad hoc human-run
// CLI); coupling compare/'s env loading to bot/'s file path would make
// compare/ unusable standalone and blur the credential-domain boundary
// this plan is scoped to stay inside (compare/** only).
export interface BatchEnvConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  householdEmail: string;
  householdPassword: string;
}

const BATCH_ENV_KEYS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "HOUSEHOLD_EMAIL", "HOUSEHOLD_PASSWORD"] as const;

/** True once all four `--batch` keys are present (compare/.env or env). */
export function hasBatchAuth(): boolean {
  return BATCH_ENV_KEYS.every((key) => Boolean(process.env[key]));
}

/** Reads + validates the four keys; throws (never prints a value) when one
 * is missing so a misconfigured run fails fast, before any network call. */
export function loadBatchEnv(): BatchEnvConfig {
  const need = (key: string): string => {
    const value = process.env[key];
    if (!value) {
      throw new Error(
        `missing env: ${key} (compare/.env, mode 600) — --batch needs SUPABASE_URL, SUPABASE_ANON_KEY, HOUSEHOLD_EMAIL, HOUSEHOLD_PASSWORD; see compare/README.md`,
      );
    }
    return value;
  };
  return {
    supabaseUrl: need("SUPABASE_URL"),
    supabaseAnonKey: need("SUPABASE_ANON_KEY"),
    householdEmail: need("HOUSEHOLD_EMAIL"),
    householdPassword: need("HOUSEHOLD_PASSWORD"),
  };
}
