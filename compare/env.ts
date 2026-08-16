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
