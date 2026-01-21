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

## Recipe File Format

See `src/data/recipes/README.md` for full documentation and rationale.



### Example Markdown Format

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

- [base] 1 tbsp olive oil
- 1 onion, chopped
- 2 garlic cloves, minced
- 1 can (400g) chickpeas, drained
- 1 can (400ml) coconut milk
- 2 tbsp curry powder
- [esoteric] 1 tsp garam masala
- Salt, to taste
- Fresh coriander, to serve

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
Parse the recipe at this URL into a Vega Plan Hub markdown recipe file. Use the format described in src/data/recipes/README.md. Only output the markdown file content. URL: <URL>
```



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

-

## Instructions

1.

## Notes

-
```

---

For more details, see the recipe format documentation in `src/data/recipes/README.md`.
