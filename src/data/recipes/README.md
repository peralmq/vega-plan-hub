# Recipes

One Markdown file per recipe. The file format (frontmatter schema,
ingredient-table shape, required sections, field semantics) is defined
in one place:

**[docs/specs/recipe-format.spec.md](../../../docs/specs/recipe-format.spec.md)**

Validate a new or edited recipe with:

```
./harness validate-recipe src/data/recipes/<file>.md
./harness validate-recipe            # whole corpus (also runs in ./harness check)
```

This README is intentionally just a pointer — do not restate the format
here. 🥗✨
