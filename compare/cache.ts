// File-backed TTL cache for store-search results (compare/.cache/,
// gitignored). Primary ICA-WAF mitigation: the fewer requests we make,
// the less bot-shaped we look — and grocery prices barely move intraday,
// so 12h staleness is fine for comparison purposes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), ".cache");
const CACHE_FILE = join(CACHE_DIR, "search.json");
const TTL_MS = 12 * 60 * 60 * 1000;

type Entry = { at: number; value: unknown };

function loadAll(): Record<string, Entry> {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function cached<T>(key: string, fn: () => Promise<T | null>): Promise<{ value: T | null; hit: boolean }> {
  const all = loadAll();
  const entry = all[key];
  if (entry && Date.now() - entry.at < TTL_MS) return { value: entry.value as T, hit: true };
  const value = await fn();
  if (value !== null) {
    // Only successful results are cached — errors and challenges retry next run.
    all[key] = { at: Date.now(), value };
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(all));
  }
  return { value, hit: false };
}
