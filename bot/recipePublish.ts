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

export interface PublishResult {
  committed: boolean;
  pushed: boolean;
}

export async function publishRecipeNote(opts: {
  repoDir: string;
  recipeId: string;
  noteLine: string;
  push: boolean;
}): Promise<PublishResult> {
  const { repoDir, recipeId, noteLine, push } = opts;
  if (!RECIPE_ID_RE.test(recipeId)) throw new Error(`invalid recipe id: ${recipeId}`);
  const rel = `${RECIPES_DIR}/${recipeId}.md`;
  const abs = join(repoDir, rel);
  if (!existsSync(abs)) throw new Error(`no such recipe file: ${rel}`);

  const git = (...args: string[]) => run("git", ["-C", repoDir, ...args]);

  // Fresh base before writing, so the push below is fast-forward. A dirty
  // deployment checkout fails loudly here rather than half-publishing.
  if (push) await git("pull", "--rebase", "origin", "main");

  const before = readFileSync(abs, "utf8");
  writeFileSync(abs, appendRecipeNote(before, noteLine));
  try {
    // The same gate CI runs — a note that breaks the format never commits.
    await run("./harness", ["validate-recipe", rel], { cwd: repoDir });
  } catch (err) {
    writeFileSync(abs, before);
    throw new Error(`validate-recipe rejected the note: ${err instanceof Error ? err.message : err}`);
  }

  await git("add", "--", rel);
  await git("commit", "-m", `p4-08 recipe note: ${recipeId} (via Vega chat)`, "--", rel);
  if (push) await git("push", "origin", "main");
  return { committed: true, pushed: push };
}
