// Minimal env loading for the M1 consumer: reads bot/.env (KEY=VALUE lines,
// chmod 600 per the r6 runbook — secrets never enter the repo) into
// process.env, then validates the required set. No dotenv dependency on
// purpose: the runtime's dependency list must stay one screen long (r4 §4 T3).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface BotConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  householdEmail: string;
  householdPassword: string;
  telegramBotToken: string;
  ollamaUrl: string;
  nluModel: string;
  sweepMs: number;
}

export function loadConfig(): BotConfig {
  const envFile = join(dirname(fileURLToPath(import.meta.url)), ".env");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] == null) process.env[m[1]] = m[2];
    }
  }
  const need = (key: string): string => {
    const value = process.env[key];
    if (!value) throw new Error(`missing env: ${key} (bot/.env or environment)`);
    return value;
  };
  return {
    supabaseUrl: need("SUPABASE_URL"),
    supabaseAnonKey: need("SUPABASE_ANON_KEY"),
    householdEmail: need("HOUSEHOLD_EMAIL"),
    householdPassword: need("HOUSEHOLD_PASSWORD"),
    telegramBotToken: need("TELEGRAM_BOT_TOKEN"),
    ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
    nluModel: process.env.NLU_MODEL ?? "qwen3:8b",
    sweepMs: Number(process.env.SWEEP_MS ?? 15000),
  };
}
