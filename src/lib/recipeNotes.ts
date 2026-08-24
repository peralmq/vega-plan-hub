// Pure core of the recipe-notes write path (p4-08): everything here is
// deterministic string work, unit-tested, and shared with the bot. The only
// free text that ever reaches a recipe file is the parser's `note` slot,
// verbatim, inside formatNoteLine's template — the r4 §4 T2 guarantee that
// no LLM-generated file content exists is enforced by this module's shape.

export interface RecipeIndexEntry {
  id: string;
  title: string;
}

// Append one bullet to the `## Notes` section. The recipe format
// (recipe-format.spec.md) fixes section order as Ingredients →
// Instructions → Notes, so when `## Notes` exists the end of the file IS
// the end of that section; when it doesn't, the section is created at the
// end. `./harness validate-recipe` re-checks the result before any commit.
export function appendRecipeNote(markdown: string, noteLine: string): string {
  // Last line of defense against structure injection: a note is ONE bullet.
  // Without this, a note containing newlines could smuggle headings or
  // table rows into the file — and a lone extra section at the end is
  // something validate-recipe accepts (found by the p4-08 e2e test).
  const bullet = `- ${noteLine.replace(/\s+/g, " ").trim()}`;
  const body = markdown.replace(/\s+$/, "");
  if (/^## Notes\s*$/m.test(markdown)) return `${body}\n${bullet}\n`;
  return `${body}\n\n## Notes\n\n${bullet}\n`;
}

// The committed note line: verbatim note + attribution + date. Household
// notes stay in the sender's own words (Swedish OK — p4-08 Decision Log);
// only the first letter is capitalized to sit well in the rendered list.
export function formatNoteLine(
  note: string,
  authorName: string | null,
  isoDate: string,
): string {
  const text = note.trim();
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  const author = authorName?.trim() ? authorName.trim() : "hushållet";
  return `${capitalized} (${author} via Vega, ${isoDate})`;
}

// "dubbla vitlöken i mapo tofun" → the Mapo Tofu recipe: longest recipe
// title appearing as a case-insensitive substring wins, so "Dal" cannot
// shadow "Chana Dal". Returns null when no title is named — the caller
// falls back to today's planned meal.
export function matchRecipeTitle(
  text: string,
  index: RecipeIndexEntry[],
): RecipeIndexEntry | null {
  const haystack = text.toLowerCase();
  let best: RecipeIndexEntry | null = null;
  for (const entry of index) {
    const title = entry.title.trim().toLowerCase();
    if (!title || !haystack.includes(title)) continue;
    if (!best || title.length > best.title.trim().length) best = entry;
  }
  return best;
}

// Local calendar date (the household's wall clock, never UTC, which flips
// two hours early on Stockholm summer evenings). A note sent after midnight
// no longer matches the evening's meal_date — the sender names the dish
// instead, which matchRecipeTitle handles.
export function localIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
