import { Recipe } from "@/hooks/useMealPlans";

// Import all recipe markdown files using Vite's glob import
const recipeModules = import.meta.glob("/src/data/recipes/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

export interface ParsedRecipe extends Recipe {
  url?: string;
  notes?: string[];
}

interface RecipeFrontmatter {
  id: string;
  title: string;
  imageUrl: string;
  url?: string;
  cookTime: number;
  servings: number;
  difficulty: "Easy" | "Medium" | "Hard";
  tags: string[];
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: RecipeFrontmatter | null; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    return { frontmatter: null, body: content };
  }

  const [, frontmatterStr, body] = frontmatterMatch;
  
  try {
    // Simple YAML parser for our known format
    const frontmatter: Record<string, unknown> = {};
    const lines = frontmatterStr.split("\n");
    
    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;
      
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      
      // Handle quoted strings
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // Handle arrays (simple format: ["tag1", "tag2"])
      if (value.startsWith("[") && value.endsWith("]")) {
        const arrayContent = value.slice(1, -1);
        frontmatter[key] = arrayContent
          .split(",")
          .map(item => {
            const trimmed = item.trim();
            if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
                (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
              return trimmed.slice(1, -1);
            }
            return trimmed;
          })
          .filter(Boolean);
      }
      // Handle numbers
      else if (!isNaN(Number(value)) && value !== "") {
        frontmatter[key] = Number(value);
      }
      // Handle strings
      else {
        frontmatter[key] = value;
      }
    }
    
    return { 
      frontmatter: frontmatter as unknown as RecipeFrontmatter, 
      body 
    };
  } catch {
    console.error("Failed to parse frontmatter");
    return { frontmatter: null, body: content };
  }
}

/**
 * Parse ingredients from markdown body
 * Handles formats like:
 * - [base] 1 tbsp olive oil
 * - 1 onion, chopped
 * - [esoteric] 1 tsp garam masala
 */
function parseIngredients(body: string): string[] {
  const ingredientsMatch = body.match(/## Ingredients\n\n([\s\S]*?)(?=\n## |$)/);
  if (!ingredientsMatch) return [];
  
  const ingredientsSection = ingredientsMatch[1];
  const ingredients: string[] = [];
  
  // Match list items, including nested sections
  const lines = ingredientsSection.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headers like "### Tadka"
    if (trimmed.startsWith("#")) continue;
    
    // Match list items
    if (trimmed.startsWith("-")) {
      let ingredient = trimmed.slice(1).trim();
      
      // Remove [base], [esoteric], [to serve], etc. prefixes but keep the ingredient
      ingredient = ingredient.replace(/^\[(base|esoteric|to serve|optional|vegan option)\]\s*/i, "");
      
      if (ingredient) {
        ingredients.push(ingredient);
      }
    }
  }
  
  return ingredients;
}

/**
 * Parse instructions from markdown body
 */
function parseInstructions(body: string): string[] {
  const instructionsMatch = body.match(/## Instructions\n\n([\s\S]*?)(?=\n## |$)/);
  if (!instructionsMatch) return [];
  
  const instructionsSection = instructionsMatch[1];
  const instructions: string[] = [];
  
  // Match numbered list items
  const lines = instructionsSection.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Match numbered items like "1. Step one"
    const match = trimmed.match(/^\d+\.\s*(.+)$/);
    if (match) {
      instructions.push(match[1]);
    }
  }
  
  return instructions;
}

/**
 * Parse notes from markdown body
 */
function parseNotes(body: string): string[] {
  const notesMatch = body.match(/## Notes\n\n([\s\S]*?)(?=\n## |$)/);
  if (!notesMatch) return [];
  
  const notesSection = notesMatch[1];
  const notes: string[] = [];
  
  const lines = notesSection.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("-")) {
      notes.push(trimmed.slice(1).trim());
    }
  }
  
  return notes;
}

/**
 * Derive theme from tags
 */
function deriveTheme(tags: string[]): string {
  const themeMap: Record<string, string> = {
    "Indian": "Indian Cuisine",
    "Chinese": "Asian Fusion",
    "Sichuan": "Asian Fusion",
    "Thai": "Asian Fusion",
    "Lebanese": "Middle Eastern",
    "Middle Eastern": "Middle Eastern",
    "Mediterranean": "Mediterranean",
    "Baskien": "Mediterranean",
    "Comfort Food": "Comfort Food",
    "Soup": "Comfort Food",
    "Stew": "Comfort Food",
    "Curry": "Indian Cuisine",
    "Dal": "Indian Cuisine",
    "Spicy": "Spicy Heat",
  };

  for (const tag of tags) {
    if (themeMap[tag]) {
      return themeMap[tag];
    }
  }
  
  return "Vegan Favorites";
}

/**
 * Parse a single recipe markdown file
 */
function parseRecipeMarkdown(content: string, filename: string): ParsedRecipe | null {
  const { frontmatter, body } = parseFrontmatter(content);
  
  if (!frontmatter) {
    console.warn(`Failed to parse frontmatter for ${filename}`);
    return null;
  }

  const ingredients = parseIngredients(body);
  const instructions = parseInstructions(body);
  const notes = parseNotes(body);
  const theme = deriveTheme(frontmatter.tags || []);

  return {
    id: frontmatter.id,
    title: frontmatter.title,
    image: frontmatter.imageUrl,
    url: frontmatter.url,
    cookTime: frontmatter.cookTime,
    servings: frontmatter.servings,
    difficulty: frontmatter.difficulty,
    tags: frontmatter.tags || [],
    theme,
    ingredients,
    instructions,
    notes,
  };
}

/**
 * Load all recipes from markdown files
 */
export function loadAllRecipes(): ParsedRecipe[] {
  const recipes: ParsedRecipe[] = [];
  
  for (const [path, content] of Object.entries(recipeModules)) {
    // Skip README.md
    if (path.includes("README.md")) continue;
    
    const filename = path.split("/").pop() || "";
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
  return allRecipes.find(r => r.id === id);
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
