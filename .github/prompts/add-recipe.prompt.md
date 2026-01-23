# /add-recipe

## Purpose

Add a new recipe to the local database in `src/data/recipes/` in the Vega Plan Hub markdown format. Accepts either a recipe URL (to be parsed by the LLM) or a recipe title (to create a template).

## Usage

```
/add-recipe <url|title>
```

- If a URL is provided, fetch and parse the recipe using the Copilot LLM, and output a markdown file in the format described below.
- If a title is provided, create a new recipe template markdown file with that title.

## Output Location

- All recipes are saved in `src/data/recipes/`.

id: 'chickpea-curry'
title: 'Chickpea Curry'
imageUrl: 'chickpea-curry.jpg'
url: ''
cookTime: 30
servings: 4
difficulty: 'Easy'
tags: ['Indian', 'Curry', 'Quick']

## Language & Ingredient Registry Requirements

- All recipes must be written in English (en-US). If the source is in another language, translate all fields (title, ingredients, instructions, notes, etc.) to en-US.
- Ingredient names and instructions should use clear, natural American English.
- When adding or parsing ingredients, always check the canonical ingredient list in `src/data/ingredients/ingredients.json`.
  - If a new ingredient is not present, add it to `ingredients.json` with a canonical `key` and any relevant synonyms (including the original language/word if translated).
  - If an ingredient is present but a new synonym is found, add the synonym to the existing entry.
- Always use the canonical `key` from `ingredients.json` in the recipe's ingredient table.

## Recipe File Format

See `src/data/recipes/README.md` for full documentation and rationale.

### Example Markdown Format (with canonical ingredient keys)

```markdown
---
id: 'chickpea-curry'
title: 'Chickpea Curry'
imageUrl: 'chickpea-curry.jpg'
url: ''
cookTime: 30
servings: 4
difficulty: 'Easy'
tags: ['Indian', 'Curry', 'Quick']
---

## Ingredients

| quantity | unit | key          | ingredient                | notes    |
| -------- | ---- | ------------ | ------------------------- | -------- |
| 1        | tbsp | olive-oil    | olive oil                 |          |
| 1        |      | onion        | onion, chopped            |          |
| 2        |      | garlic       | garlic cloves, minced     |          |
| 400      | g    | chickpeas    | canned chickpeas, drained |          |
| 400      | ml   | coconut-milk | coconut milk              |          |
| 2        | tbsp | curry-powder | curry powder              |          |
| 1        | tsp  | garam-masala | garam masala              | esoteric |
|          |      | salt         | salt, to taste            |          |
|          |      | coriander    | fresh coriander           | to serve |

## Instructions

1. Heat oil in a pan 🥘.
2. Sauté onion and garlic until soft.
3. Add chickpeas, coconut milk, curry powder, and garam masala.
4. Simmer for 15 minutes.
5. Season with salt, garnish with coriander, and serve with rice 🍚.

## Notes

- Great for meal prep!
- Swap chickpeas for lentils for variety.
```

## LLM Prompt (for URL input)

If a URL is provided, use the following prompt:

```
Parse the recipe at this URL into a Vega Plan Hub markdown recipe file. Use the format described in src/data/recipes/README.md. The ingredients section MUST be a markdown table with columns: quantity, unit, key, ingredient, notes. Use canonical ingredient keys from src/data/ingredients/ingredients.json. Only output the markdown file content. URL: <URL>
```

id: "<slugified-title>"
title: "<title>"
imageUrl: ""
url: ""
cookTime:
servings:
difficulty: ""
tags: []

## Template (for title input)

If a title is provided, create a file with this content:

```
---
id: "<slugified-title>"
title: "<title>"
imageUrl: ""
url: ""
cookTime:
servings:
difficulty: ""
tags: []
---

## Ingredients

| quantity | unit | key | ingredient | notes |
|----------|------|-----|-----------|-------|

## Instructions

1.

## Notes

-
```

---

For more details, see the recipe format documentation in `src/data/recipes/README.md`.
