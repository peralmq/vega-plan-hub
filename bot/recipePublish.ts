// The enumerated repo-write tool (p4-08, tech.spec "Recipe notes"): the
// only path from chat into git. Everything here is fixed-argument execFile —
// no shell string ever exists, and the LLM never reaches this layer at all:
// tools.ts calls it with a template-formatted note line only after the
// sender pressed [Ja, spara]. Failure anywhere rolls the file back and
// leaves the working tree exactly as found.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendRecipeNote, type RecipeIndexEntry } from "../src/lib/recipeNotes";
import { applyScale, type SynonymEntry } from "../src/lib/recipeEdits";

const run = promisify(execFile);

// Same shape the harness enforces for frontmatter ids; doubles as the
// path-traversal guard (a kebab-case id cannot escape src/data/recipes/).
const RECIPE_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RECIPES_DIR = "src/data/recipes";

// The bot can't use the app's recipeLoader (import.meta.glob is
// Vite-only), so titles come from a line-oriented read of the same
// frontmatter shape the hand-rolled parsers already rely on.
export function loadRecipeIndex(repoDir: string): RecipeIndexEntry[] {
  const dir = join(repoDir, RECIPES_DIR);
  const entries: RecipeIndexEntry[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md") || file === "README.md") continue;
    const id = file.slice(0, -3);
    const m = readFileSync(join(dir, file), "utf8").match(/^title:\s*(.+)$/m);
    const title = m ? m[1].trim().replace(/^["']|["']$/g, "") : id;
    entries.push({ id, title });
  }
  return entries;
}

// The ingredients reference doubles as the Swedish→table-key bridge for
// edit-term matching ("vitlök" → garlic). fs-read like the index: tsx has
// no JSON-module story worth adding a tsconfig flag for.
export function loadIngredientSynonyms(repoDir: string): SynonymEntry[] {
  const raw = readFileSync(join(repoDir, "src/data/ingredients/ingredients.json"), "utf8");
  return (JSON.parse(raw) as Array<{ key: string; synonyms?: string[] }>).map((e) => ({
    key: e.key,
    synonyms: e.synonyms ?? [],
  }));
}

// Current content for the edit preview shown in the confirm message.
export function readRecipe(repoDir: string, recipeId: string): string {
  if (!RECIPE_ID_RE.test(recipeId)) throw new Error(`invalid recipe id: ${recipeId}`);
  return readFileSync(join(repoDir, RECIPES_DIR, `${recipeId}.md`), "utf8");
}

export interface PublishResult {
  committed: boolean;
  pushed: boolean;
}

// The shared publish shell: fresh base → transform → validate (rollback on
// failure) → commit → push. Both note and edit go through this exact path.
async function publishRecipeChange(opts: {
  repoDir: string;
  recipeId: string;
  push: boolean;
  transform: (content: string) => string;
  commitMessage: string;
}): Promise<PublishResult> {
  const { repoDir, recipeId, push, transform, commitMessage } = opts;
  if (!RECIPE_ID_RE.test(recipeId)) throw new Error(`invalid recipe id: ${recipeId}`);
  const rel = `${RECIPES_DIR}/${recipeId}.md`;
  const abs = join(repoDir, rel);
  if (!existsSync(abs)) throw new Error(`no such recipe file: ${rel}`);

  const git = (...args: string[]) => run("git", ["-C", repoDir, ...args]);

  // Fresh base before writing, so the push below is fast-forward. A dirty
  // deployment checkout fails loudly here rather than half-publishing.
  if (push) await git("pull", "--rebase", "origin", "main");

  const before = readFileSync(abs, "utf8");
  writeFileSync(abs, transform(before));
  try {
    // The same gate CI runs — a change that breaks the format never commits.
    await run("./harness", ["validate-recipe", rel], { cwd: repoDir });
  } catch (err) {
    writeFileSync(abs, before);
    throw new Error(`validate-recipe rejected the change: ${err instanceof Error ? err.message : err}`);
  }

  await git("add", "--", rel);
  await git("commit", "-m", commitMessage, "--", rel);
  if (push) await git("push", "origin", "main");
  return { committed: true, pushed: push };
}

export function publishRecipeNote(opts: {
  repoDir: string;
  recipeId: string;
  noteLine: string;
  push: boolean;
}): Promise<PublishResult> {
  return publishRecipeChange({
    repoDir: opts.repoDir,
    recipeId: opts.recipeId,
    push: opts.push,
    transform: (content) => appendRecipeNote(content, opts.noteLine),
    commitMessage: `p4-08 recipe note: ${opts.recipeId} (via Vega chat)`,
  });
}

// The scale is recomputed on the fresh post-pull file, so a confirm pressed
// seconds after the question can never double an already-doubled row from
// some other change — it re-derives from current content or fails loudly.
export function publishRecipeEdit(opts: {
  repoDir: string;
  recipeId: string;
  candidates: string[];
  factor: number;
  push: boolean;
}): Promise<PublishResult> {
  return publishRecipeChange({
    repoDir: opts.repoDir,
    recipeId: opts.recipeId,
    push: opts.push,
    transform: (content) => {
      const result = applyScale(content, opts.candidates, opts.factor);
      if (!result.ok) throw new Error(`edit no longer applies (${result.reason})`);
      return result.markdown;
    },
    commitMessage: `p4-09 recipe edit: ${opts.recipeId} ×${opts.factor} (via Vega chat)`,
  });
}
