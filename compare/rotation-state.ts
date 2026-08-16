// Rotation history persistence (p5-02): which store got the last run for
// each affinity term. A local gitignored file on the household machine —
// run history is household data, not repo data (same home as .cache and
// .env; no Supabase schema, per the plan's ask-first non-goal). Written
// only on an explicit `--record <store>`: the suggestion itself is
// advisory and the human's actual order is what gets remembered.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ListItem, RotationHistory } from "@/lib/storeRotation";
import { allowedTerms } from "@/lib/storeRotation";

const stateFile = (): string =>
  join(dirname(fileURLToPath(import.meta.url)), ".rotation.json");

export function loadRotationHistory(): RotationHistory {
  if (!existsSync(stateFile())) return {};
  return JSON.parse(readFileSync(stateFile(), "utf8")) as RotationHistory;
}

/** Record that `store` got this run: every affinity item it may supply is
 * stamped with the store and today's date. Non-affinity items carry no
 * history — rotation only exists where the household constrained stores. */
export function recordRun(store: string, items: ListItem[], date: string): RotationHistory {
  const history = loadRotationHistory();
  for (const term of allowedTerms(items.filter((i) => i.stores !== null), store)) {
    history[term] = { store, date };
  }
  writeFileSync(stateFile(), JSON.stringify(history, null, 2) + "\n");
  return history;
}
