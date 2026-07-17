import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getAllTags,
  getAllThemes,
  getRecipeById,
  loadAllRecipes,
  parseFrontmatter,
  parseIngredients,
  parseInstructions,
  parseRecipeMarkdown,
} from './recipeLoader';

const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);

// Ground truth is the committed file list, not a hardcoded count — this
// keeps the test accurate as recipes are added (tech.spec.md's "19
// recipes" figure and this plan's Verification wording were written
// before the latest recipe-content commits and are currently stale; see
// docs/execplans/p1-02-unit-test-suite.md Evidence).
const RECIPE_DIR = join(__dirname, '..', 'data', 'recipes');
const COMMITTED_RECIPE_COUNT = readdirSync(RECIPE_DIR).filter(
  (f) => f.endsWith('.md') && f !== 'README.md',
).length;

describe('loadAllRecipes (integration over committed recipe files)', () => {
  const recipes = loadAllRecipes();

  it('loads every committed recipe file, skipping README.md', () => {
    expect(COMMITTED_RECIPE_COUNT).toBeGreaterThan(0);
    expect(recipes).toHaveLength(COMMITTED_RECIPE_COUNT);
  });

  it('gives every recipe a unique id', () => {
    const ids = recipes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('parses required frontmatter fields for every recipe', () => {
    for (const recipe of recipes) {
      expect(recipe.id, 'id').toBeTruthy();
      expect(recipe.title, `title for ${recipe.id}`).toBeTruthy();
      // Not all recipes carry an image (e.g. swedish-vegan-hash-with-tofu-egg
      // ships with imageUrl: "" in its frontmatter) — assert shape, not
      // presence.
      expect(typeof recipe.image, `image for ${recipe.id}`).toBe('string');
      expect(typeof recipe.cookTime, `cookTime for ${recipe.id}`).toBe('number');
      expect(recipe.cookTime, `cookTime for ${recipe.id}`).toBeGreaterThan(0);
      expect(typeof recipe.servings, `servings for ${recipe.id}`).toBe('number');
      expect(recipe.servings, `servings for ${recipe.id}`).toBeGreaterThan(0);
      expect(DIFFICULTIES.has(recipe.difficulty), `difficulty for ${recipe.id}`).toBe(true);
      expect(Array.isArray(recipe.tags), `tags for ${recipe.id}`).toBe(true);
    }
  });

  it('parses a non-empty ingredients table for every recipe', () => {
    for (const recipe of recipes) {
      expect(recipe.ingredients.length, `ingredients for ${recipe.id}`).toBeGreaterThan(0);
      for (const ing of recipe.ingredients) {
        expect(ing.ingredient, `ingredient name in ${recipe.id}`).toBeTruthy();
      }
    }
  });

  it('parses at least one instruction step for every recipe', () => {
    for (const recipe of recipes) {
      expect(recipe.instructions.length, `instructions for ${recipe.id}`).toBeGreaterThan(0);
    }
  });

  it('derives a theme for every recipe', () => {
    for (const recipe of recipes) {
      expect(recipe.theme, `theme for ${recipe.id}`).toBeTruthy();
    }
  });

  it('getRecipeById finds a known recipe and returns undefined for an unknown id', () => {
    expect(getRecipeById('chana-dal')?.title).toBeTruthy();
    expect(getRecipeById('does-not-exist')).toBeUndefined();
  });

  it('getAllTags and getAllThemes return sorted, de-duplicated lists', () => {
    const tags = getAllTags();
    expect(tags.length).toBeGreaterThan(0);
    expect(tags).toEqual([...new Set(tags)].sort());

    const themes = getAllThemes();
    expect(themes.length).toBeGreaterThan(0);
    expect(themes).toEqual([...new Set(themes)].sort());
  });
});

describe('parseFrontmatter', () => {
  it('parses a well-formed frontmatter block', () => {
    const { frontmatter, body } = parseFrontmatter(
      '---\nid: "test-recipe"\ntitle: "Test Recipe"\nimageUrl: "http://x/y.jpg"\ncookTime: 20\nservings: 2\ndifficulty: "Easy"\ntags: ["Quick", "Vegan"]\n---\n\n## Ingredients\n\nbody here',
    );
    expect(frontmatter).toEqual({
      id: 'test-recipe',
      title: 'Test Recipe',
      imageUrl: 'http://x/y.jpg',
      cookTime: 20,
      servings: 2,
      difficulty: 'Easy',
      tags: ['Quick', 'Vegan'],
    });
    expect(body).toContain('## Ingredients');
  });

  it('returns a null frontmatter for content with no frontmatter block', () => {
    const { frontmatter, body } = parseFrontmatter('# Just a heading\n\nNo frontmatter here.');
    expect(frontmatter).toBeNull();
    expect(body).toBe('# Just a heading\n\nNo frontmatter here.');
  });

  it('returns a null frontmatter for an unterminated frontmatter block', () => {
    const { frontmatter } = parseFrontmatter('---\nid: "broken"\ntitle: "Broken"\n\n## Ingredients\n');
    expect(frontmatter).toBeNull();
  });
});

describe('parseIngredients', () => {
  it('parses a well-formed ingredients table', () => {
    const body =
      '## Ingredients\n\n| quantity | unit | key | ingredient | notes |\n|---|---|---|---|---|\n| 1 | dl | onion | onion | chopped |\n| 2 | tsp | salt | salt |  |\n\n## Instructions\n';
    const result = parseIngredients(body);
    expect(result).toEqual([
      { quantity: '1', unit: 'dl', key: 'onion', ingredient: 'onion', notes: 'chopped' },
      { quantity: '2', unit: 'tsp', key: 'salt', ingredient: 'salt', notes: '' },
    ]);
  });

  it('returns an empty array when there is no Ingredients section', () => {
    expect(parseIngredients('## Instructions\n\n1. Do a thing.')).toEqual([]);
  });

  it('returns an empty array when the Ingredients section has no table', () => {
    expect(parseIngredients('## Ingredients\n\nJust prose, no table.\n\n## Instructions\n')).toEqual(
      [],
    );
  });
});

describe('parseInstructions', () => {
  it('parses a numbered instructions list', () => {
    const body = '## Instructions\n\n1. Chop the onion.\n2. Fry it.\n\n## Notes\n';
    expect(parseInstructions(body)).toEqual(['Chop the onion.', 'Fry it.']);
  });

  it('returns an empty array when there is no Instructions section', () => {
    expect(parseInstructions('## Ingredients\n\n| a |\n')).toEqual([]);
  });

  it('ignores non-numbered lines inside the Instructions section', () => {
    const body = '## Instructions\n\nSome intro text.\n1. Actual step.\n';
    expect(parseInstructions(body)).toEqual(['Actual step.']);
  });
});

describe('parseRecipeMarkdown (malformed input)', () => {
  it('returns null when frontmatter is missing entirely', () => {
    expect(parseRecipeMarkdown('Just a plain markdown file, no frontmatter.', 'broken.md')).toBeNull();
  });

  it('returns null when the frontmatter block is unterminated', () => {
    const content = '---\nid: "broken"\ntitle: "Broken"\n\n## Ingredients\n';
    expect(parseRecipeMarkdown(content, 'broken.md')).toBeNull();
  });

  it('parses a minimal but well-formed recipe, defaulting missing sections to empty', () => {
    const content =
      '---\nid: "minimal"\ntitle: "Minimal"\nimageUrl: "http://x/y.jpg"\ncookTime: 10\nservings: 1\ndifficulty: "Easy"\ntags: []\n---\n\n## Ingredients\n\n| quantity | unit | key | ingredient | notes |\n|---|---|---|---|---|\n| 1 | g | salt | salt |  |\n\n## Instructions\n\n1. Eat it.\n';
    const recipe = parseRecipeMarkdown(content, 'minimal.md');
    expect(recipe).not.toBeNull();
    expect(recipe?.id).toBe('minimal');
    expect(recipe?.ingredients).toHaveLength(1);
    expect(recipe?.instructions).toEqual(['Eat it.']);
    expect(recipe?.notes).toEqual([]);
  });
});
