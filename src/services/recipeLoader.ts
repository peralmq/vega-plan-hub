// The web app's recipe library: Vite bundles every markdown file in the
// corpus at build time and hands it to the SHARED parser in
// src/lib/recipeMarkdown.ts (extracted by p4-03 so the bot can run the exact
// same parsing over an fs read — see that module's header). This file keeps
// the Vite-only half (`import.meta.glob`) and re-exports the parser so every
// existing `@/services/recipeLoader` import keeps working unchanged.

import { parseRecipeMarkdown } from '@/lib/recipeMarkdown';

export type {
  ParsedIngredient,
  ParsedRecipe,
  RecipeFrontmatter,
} from '@/lib/recipeMarkdown';
export {
  parseFrontmatter,
  parseIngredients,
  parseInstructions,
  parseRecipeMarkdown,
} from '@/lib/recipeMarkdown';

import type { ParsedRecipe } from '@/lib/recipeMarkdown';

// Import all recipe markdown files using Vite's glob import
const recipeModules = import.meta.glob('/src/data/recipes/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * Load all recipes from markdown files
 */
export function loadAllRecipes(): ParsedRecipe[] {
  const recipes: ParsedRecipe[] = [];

  for (const [path, content] of Object.entries(recipeModules)) {
    // Skip README.md
    if (path.includes('README.md')) continue;

    const filename = path.split('/').pop() || '';
    const parsed = parseRecipeMarkdown(content as string, filename);

    if (parsed) {
      recipes.push(parsed);
    }
  }

  return recipes;
}

/**
 * Get a single recipe by ID
 */
export function getRecipeById(id: string): ParsedRecipe | undefined {
  const allRecipes = loadAllRecipes();
  return allRecipes.find((r) => r.id === id);
}

/**
 * Get all unique tags from recipes
 */
export function getAllTags(): string[] {
  const allRecipes = loadAllRecipes();
  const tagSet = new Set<string>();

  for (const recipe of allRecipes) {
    for (const tag of recipe.tags) {
      tagSet.add(tag);
    }
  }

  return Array.from(tagSet).sort();
}

/**
 * Get all unique themes from recipes
 */
export function getAllThemes(): string[] {
  const allRecipes = loadAllRecipes();
  const themeSet = new Set<string>();

  for (const recipe of allRecipes) {
    themeSet.add(recipe.theme);
  }

  return Array.from(themeSet).sort();
}
