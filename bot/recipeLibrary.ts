// Recipe access for the bot (p4-03 step 1, Decision Log: SHARED LOADER, not a
// build-time mirror). The web app hands the corpus to
// src/lib/recipeMarkdown.ts via Vite's `import.meta.glob`; the bot hands it the
// same files from its checkout via `fs`. One parser, one format contract — and
// no generated mirror that could disagree with a recipe the bot itself just
// committed through the p4-08/09 write path.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseRecipeMarkdown, type ParsedRecipe } from "../src/lib/recipeMarkdown";
import type { RecipeIndexEntry } from "../src/lib/recipeNotes";

const RECIPES_DIR = "src/data/recipes";

export function loadRecipeLibrary(repoDir: string): ParsedRecipe[] {
  const dir = join(repoDir, RECIPES_DIR);
  const recipes: ParsedRecipe[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".md") || file === "README.md") continue;
    const parsed = parseRecipeMarkdown(readFileSync(join(dir, file), "utf8"), file);
    if (parsed) recipes.push(parsed);
  }
  return recipes;
}

// The note/edit path only needs id + title; deriving it from the same parse
// keeps a single reading of the frontmatter (it used to be its own regex).
export function loadRecipeIndex(repoDir: string): RecipeIndexEntry[] {
  return loadRecipeLibrary(repoDir).map((r) => ({ id: r.id, title: r.title }));
}
