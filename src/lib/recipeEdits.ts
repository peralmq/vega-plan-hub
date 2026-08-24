// Pure core of structured recipe edits (p4-09): rules interpret the raw
// utterance, pure code applies the change, and the diff is echoed to the
// sender before anything is saved. Deliberately NOT fed by the NLU: the
// note slot compresses "dubbla vitlöken" to "vitlök" (heldout fixture),
// and per the R3 thesis a deterministic sub-problem removed from the model
// is an error class converted to zero. No rule match → p4-08 note path.

import { matchCandidates } from "./botActions";

export interface EditIntent {
  factor: number;
  term: string;
}

export interface SynonymEntry {
  key: string;
  synonyms: string[];
}

export interface ScaleChange {
  key: string;
  ingredient: string;
  unit: string;
  from: string;
  to: string;
}

export type ScaleResult =
  | { ok: true; markdown: string; changes: ScaleChange[] }
  | { ok: false; reason: "no-match" | "not-numeric" };

// The enumerable verb set — growing it is a spec-visible change
// (tech.spec "Structured recipe edits"). First match wins; compound
// utterances are a non-goal in v1.
const VERBS: Array<{ re: RegExp; factor: number }> = [
  { re: /\b(?:tredubbla|tripla|triple)\b/, factor: 3 },
  { re: /\b(?:dubbla|dubbel|double)\b/, factor: 2 },
  { re: /\b(?:halvera|halva|halve)\b/, factor: 0.5 },
];

// Term = what follows the verb, up to a preposition/tail the household
// phrasings use ("dubbla vitlöken i mapo tofun nästa gång" → "vitlöken").
const TERM_STOP = /\s+(?:i|in|på|till|for|nästa|next)\b|[.,!?]/;

export function interpretEdit(rawText: string): EditIntent | null {
  const text = rawText.toLowerCase();
  for (const { re, factor } of VERBS) {
    const m = re.exec(text);
    if (!m) continue;
    let rest = text.slice(m.index + m[0].length);
    rest = rest.replace(/^\s+(?:mängden|the|amount of)\s+/, " ");
    const stop = TERM_STOP.exec(rest);
    const term = (stop ? rest.slice(0, stop.index) : rest).trim();
    if (!/[a-zåäöé]/.test(term)) continue;
    return { factor, term };
  }
  return null;
}

// "vitlöken" → ["vitlöken", "vitlök", "garlic", "garlic clove", …]:
// definite-suffix candidates (shared with the shopping tools) plus the
// ingredients.json entry whose synonyms contain one of them — the
// Swedish→table-key bridge.
export function expandTermCandidates(
  term: string,
  synonyms: SynonymEntry[],
): string[] {
  const candidates = matchCandidates(term);
  for (const entry of synonyms) {
    const names = [entry.key, ...entry.synonyms].map((s) => s.toLowerCase());
    if (candidates.some((c) => names.includes(c))) {
      for (const name of names) if (!candidates.includes(name)) candidates.push(name);
    }
  }
  return candidates;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Corpus quantity shapes (surveyed 2026-08-24): int, decimal (dot or
// comma), range with hyphen or en-dash ("2-3", "6–10"), fraction and
// mixed fraction. Anything else (incl. empty) is not scalable.
function scaleQuantity(raw: string, factor: number): string | null {
  const q = raw.trim();
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  const num = (s: string) => parseFloat(s.replace(",", "."));

  const range = q.match(/^(\d+(?:[.,]\d+)?)\s*([-–])\s*(\d+(?:[.,]\d+)?)$/);
  if (range) return `${fmt(num(range[1]) * factor)}${range[2]}${fmt(num(range[3]) * factor)}`;
  const mixed = q.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return fmt((parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10)) * factor);
  const fraction = q.match(/^(\d+)\/(\d+)$/);
  if (fraction) return fmt((parseInt(fraction[1], 10) / parseInt(fraction[2], 10)) * factor);
  if (/^\d+(?:[.,]\d+)?$/.test(q)) return fmt(num(q) * factor);
  return null;
}

// Scale matching rows of the `## Ingredients` table. Key-cell matching is
// EXACT against the candidate set, so "vitlök" scales `garlic` but never
// `garlic-powder`; only when no key matches at all is a word-boundary
// match on the display cell tried — the human confirm gate makes that
// fallback safe. Rows that match but aren't numeric are left untouched
// (the confirm message lists exactly what changes).
export function applyScale(
  markdown: string,
  candidates: string[],
  factor: number,
): ScaleResult {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^## Ingredients\s*$/.test(l));
  if (start === -1) return { ok: false, reason: "no-match" };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }

  const rows: number[] = [];
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (!line.trimStart().startsWith("|")) continue;
    const cells = line.split("|");
    if (cells.length < 6) continue;
    const key = cells[3].trim().toLowerCase();
    if (!key || key === "key" || /^-+$/.test(key)) continue; // header/separator
    rows.push(i);
  }

  let matched = rows.filter((i) => candidates.includes(lines[i].split("|")[3].trim().toLowerCase()));
  if (matched.length === 0) {
    const wordRes = candidates.map((c) => new RegExp(`\\b${escapeRe(c)}\\b`));
    matched = rows.filter((i) => {
      const display = lines[i].split("|")[4].trim().toLowerCase();
      return wordRes.some((re) => re.test(display));
    });
  }
  if (matched.length === 0) return { ok: false, reason: "no-match" };

  const changes: ScaleChange[] = [];
  for (const i of matched) {
    const cells = lines[i].split("|");
    const from = cells[1].trim();
    const to = scaleQuantity(from, factor);
    if (to == null) continue;
    cells[1] = ` ${to} `;
    lines[i] = cells.join("|");
    changes.push({
      key: cells[3].trim(),
      ingredient: cells[4].trim(),
      unit: cells[2].trim(),
      from,
      to,
    });
  }
  if (changes.length === 0) return { ok: false, reason: "not-numeric" };
  return { ok: true, markdown: lines.join("\n"), changes };
}

export function describeChanges(changes: ScaleChange[]): string {
  return changes
    .map((c) => `• ${c.ingredient}: ${c.from} → ${c.to}${c.unit ? ` ${c.unit}` : ""}`)
    .join("\n");
}
