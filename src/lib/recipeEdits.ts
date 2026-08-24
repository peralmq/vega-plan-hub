// Pure core of structured recipe edits (p4-09): rules interpret the raw
// utterance, pure code applies the change, and the diff is echoed to the
// sender before anything is saved. Deliberately NOT fed by the NLU: the
// note slot compresses "dubbla vitlöken" to "vitlök" (heldout fixture),
// and per the R3 thesis a deterministic sub-problem removed from the model
// is an error class converted to zero. This module is also the rules-layer
// classifier for these phrasings (intentParser imports interpretEdit after
// the 2026-08-24 live miss: without "nästa gång" the LLM filed "dubbla
// vitlöken i mapo tofun" under the planning intents). No match → p4-08
// note path.

import { matchCandidates } from "./botActions";

export type EditIntent =
  | { kind: "scale"; factor: number; term: string; phrase: string; confident: boolean }
  | { kind: "set"; value: string; term: string; phrase: string; confident: boolean };

export interface SynonymEntry {
  key: string;
  synonyms: string[];
}

export interface EditChange {
  key: string;
  ingredient: string;
  unit: string;
  from: string;
  to: string;
}

export type EditResult =
  | { ok: true; markdown: string; changes: EditChange[] }
  | { ok: false; reason: "no-match" | "not-numeric" | "ambiguous" };

// The enumerable verb set — growing it is a spec-visible change
// (tech.spec "Structured recipe edits"). First match wins; compound
// utterances are a non-goal in v1. `confident` verbs are unambiguous
// recipe-edit language and may claim intent classification on their own;
// the vaguer mer/mindre family needs an anchor ("nästa gång") for that —
// the factor it maps to is a household default the confirm makes visible.
// JS \b is ASCII-only — a boundary next to å/ä/ö silently fails ("ändra",
// "dra ner på") — so word edges use letter-class lookarounds instead.
const B = "(?<![a-zåäöé])";
const E = "(?![a-zåäöé])";
const SCALE_VERBS: Array<{ re: RegExp; factor: number; confident: boolean }> = [
  { re: new RegExp(`${B}(?:tredubbla|tripla|triple)${E}`), factor: 3, confident: true },
  { re: new RegExp(`${B}(?:dubbla|dubblera|double)${E}`), factor: 2, confident: true },
  { re: new RegExp(`${B}(?:halvera|halva|halve)${E}`), factor: 0.5, confident: true },
  { re: new RegExp(`${B}(?:öka|mer|more|increase)${E}`), factor: 1.5, confident: false },
  { re: new RegExp(`${B}(?:dra ner på|minska|mindre|less|reduce)${E}`), factor: 0.75, confident: false },
];

// Term = what follows the verb, up to a preposition/tail the household
// phrasings use ("dubbla vitlöken i mapo tofun nästa gång" → "vitlöken").
const TERM_STOP = new RegExp(`\\s+(?:i|in|på|till|for|nästa|next|istället|instead|tack|please)${E}|[.,!?]`);
const TERM_LEAD = /^\s+(?:mängden|på|the|amount of)\s+/;

const SET_TO_N = new RegExp(`${B}(?:ändra|sätt|change)\\s+(?:the\\s+)?(.+?)\\s+(?:till|to)\\s+(\\d+(?:[.,]\\d+)?)${E}`);
const TAKE_N_INSTEAD = new RegExp(`${B}(?:ta|använd|use)\\s+(\\d+(?:[.,]\\d+)?)\\s+(.+?)\\s+(?:istället|instead)${E}`);

export function interpretEdit(rawText: string): EditIntent | null {
  const text = rawText.toLowerCase();

  // Set-to-N phrasings: "ändra vitlöken till 4", "ta 4 klyftor istället".
  let m = text.match(SET_TO_N);
  if (m) return { kind: "set", term: m[1].trim(), value: m[2].replace(",", "."), phrase: m[0], confident: true };
  m = text.match(TAKE_N_INSTEAD);
  if (m) return { kind: "set", term: m[2].trim(), value: m[1].replace(",", "."), phrase: m[0], confident: true };

  for (const { re, factor, confident } of SCALE_VERBS) {
    const v = re.exec(text);
    if (!v) continue;
    let rest = text.slice(v.index + v[0].length);
    rest = rest.replace(TERM_LEAD, " ");
    const stop = TERM_STOP.exec(rest);
    const term = (stop ? rest.slice(0, stop.index) : rest).trim();
    if (!/[a-zåäöé]/.test(term)) continue;
    return { kind: "scale", factor, term, phrase: `${v[0]} ${term}`, confident };
  }
  return null;
}

// "vitlöken" → ["vitlöken", "vitlök", "garlic", "garlic clove", …]:
// definite-suffix candidates (shared with the shopping tools) plus the
// ingredients.json entry whose synonyms contain one of them — the
// Swedish→table-key bridge. Multi-word terms ("klyftor vitlök") also try
// each word, so a stray unit word can't hide the ingredient.
export function expandTermCandidates(
  term: string,
  synonyms: SynonymEntry[],
): string[] {
  const candidates = matchCandidates(term);
  for (const word of term.split(/\s+/)) {
    if (word.length >= 3) {
      for (const c of matchCandidates(word)) if (!candidates.includes(c)) candidates.push(c);
    }
  }
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

// Apply an edit to the `## Ingredients` table. Key-cell matching is EXACT
// against the candidate set, so "vitlök" scales `garlic` but never
// `garlic-powder`; only when no key matches at all is a word-boundary
// match on the display cell tried — the human confirm gate makes that
// fallback safe. Scale touches every matched numeric row; set demands
// exactly one matched row (setting two rows to the same number is almost
// never what the cook meant — refuse and let it become a note).
export function applyEdit(
  markdown: string,
  candidates: string[],
  edit: EditIntent,
): EditResult {
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
  if (edit.kind === "set" && matched.length > 1) return { ok: false, reason: "ambiguous" };

  const changes: EditChange[] = [];
  for (const i of matched) {
    const cells = lines[i].split("|");
    const from = cells[1].trim();
    const to = edit.kind === "scale" ? scaleQuantity(from, edit.factor) : edit.value;
    if (to == null || to === from) continue;
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

export function describeChanges(changes: EditChange[]): string {
  return changes
    .map((c) => `• ${c.ingredient}: ${c.from} → ${c.to}${c.unit ? ` ${c.unit}` : ""}`)
    .join("\n");
}
