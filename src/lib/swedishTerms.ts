// Matching a spoken Swedish term against stored text, extracted from
// botActions.ts (p4-03 live-feedback round 2) so both the shopping-list tools
// and the planning conversation can use it. The conversation needs it to
// resolve "byt dalen mot pyttipanna" against pool dishes; botActions needs it
// to find "spenaten" among list rows. It lives in its own module because
// botActions imports the conversation's event mapper, so the reverse import
// would be a cycle.

import { normalizeIngredientName } from "./ingredientNormalization";

// Check-off and removal match by ilike against what's on the list, but
// Swedish speech uses definite forms ("bocka av spenaten") while list rows
// hold the bare item ("spenat"). Candidates are tried in order until one
// matches; the full term always goes first so exact phrasing wins.
// "na" before "en"/"et": "linserna" → "linser" (not "lins…"), and bare "n"
// last so "tofun" → "tofu". ilike is substring anyway, so the stripped form
// only needs to be a prefix of the listed row, not the perfect lemma.
const DEFINITE_SUFFIXES = ["na", "en", "et", "n"];

export function matchCandidates(term: string): string[] {
  const t = term.trim().toLowerCase();
  const candidates = [t];
  for (const suffix of DEFINITE_SUFFIXES) {
    if (t.endsWith(suffix) && t.length - suffix.length >= 3) {
      candidates.push(t.slice(0, -suffix.length));
      break; // longest matching suffix only
    }
  }
  const canonical = normalizeIngredientName(t);
  if (!candidates.includes(canonical)) candidates.push(canonical);
  return candidates;
}
