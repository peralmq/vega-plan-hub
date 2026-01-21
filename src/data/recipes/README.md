# Vega Plan Hub Recipe File Format

This document describes the local recipe file format for Vega Plan Hub. Recipes are stored as Markdown files with YAML frontmatter and structured sections. This format is designed to be human-readable, version-controlled, and easily parsed by the app.

## File Location

All recipes are stored in:

```
src/data/recipes/
```

## File Format Overview

Each recipe is a Markdown file with the following structure:

```markdown
---
id: "unique-id"
title: "Recipe Title"
image: "image-filename.jpg"
cookTime: 30
servings: 4
difficulty: "Easy"
tags: ["Tag1", "Tag2"]
---

## Ingredients

- [base] 1 tbsp olive oil
- 1 onion, chopped
- [esoteric] 1 tsp garam masala
- ...

## Instructions

1. Step one 🥘
2. Step two

## Notes

- Optional tips or comments
```

## Field Descriptions & Reasoning

### YAML Frontmatter
- **id**: Unique identifier for the recipe (used for lookups and URLs).
- **title**: Human-friendly recipe name.
- **image**: Filename or URL for the recipe image.
- **cookTime**: Estimated cooking time in minutes (integer).
- **servings**: Number of servings (integer).
- **difficulty**: One of "Easy", "Medium", or "Hard" (for filtering).
- **tags**: Array of tags for filtering and search (e.g., cuisine, meal type).

### Ingredients Section
- Each ingredient is a Markdown list item.
- Prefix with `[base]` if it's a pantry staple (e.g., oil, salt).
- Prefix with `[esoteric]` for rare/specialty items.
- Unmarked items are standard ingredients.
- This structure supports shopping list generation and future ingredient-based planning.

### Instructions Section
- Markdown numbered list for step-by-step cooking instructions.
- Emojis are encouraged for a playful, friendly tone.

### Notes Section
- Optional. For tips, substitutions, or extra info.

## Example

See `chickpea-curry.md` for a real example.

## Why This Format?
- **Human-readable**: Easy to edit and review in code.
- **Version-controlled**: Changes tracked in git.
- **Structured**: Simple to parse for app features (meal planning, shopping lists, etc.).
- **Extensible**: New fields or tags can be added as needed.

---

For questions or suggestions, open an issue or discuss with the team! 🥗✨
