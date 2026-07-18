# Recipe File Format — Vega Plan Hub

Status: binding. Extracted 2026-07-17 from the shipped parser
(`src/services/recipeLoader.ts`) and the committed corpus
(`src/data/recipes/*.md`, 18 files) as part of execplan
[p1-05-validate-recipe](../execplans/p1-05-validate-recipe.md). This is
the single authoritative definition of the recipe file format —
`src/data/recipes/README.md` and [tech.spec.md](tech.spec.md) point here
rather than restating it. Enforced by `./harness validate-recipe`.

## File location and scope

Recipes live in `src/data/recipes/*.md`, one file per recipe, loaded at
build time via `import.meta.glob('/src/data/recipes/*.md', { query:
'?raw', eager: true })` (non-recursive — files in subdirectories are not
loaded). `README.md` in that directory is documentation, not a recipe,
and is skipped by both the loader and the validator.

## Overall structure

```markdown
---
id: "unique-kebab-case-id"
title: "Recipe Title"
imageUrl: "https://example.com/image.jpg"
url: "https://example.com/original-recipe"
cookTime: 30
servings: 4
difficulty: "Easy"
tags: ["Tag1", "Tag2"]
---

## Ingredients

| quantity | unit | key    | ingredient  | notes   |
|----------|------|--------|-------------|---------|
| 1        | tbsp | onion  | onion       | chopped |

## Instructions

1. Step one 🥘
2. Step two

## Notes

- Optional tips or comments
```

A file is two parts: a YAML-like frontmatter block delimited by `---`
lines, and a Markdown body containing `## Ingredients`, `## Instructions`,
and optional `## Notes` sections, in that order.

## Frontmatter

Parsed as flat `key: value` lines (no nested structures) by a
hand-rolled parser, not a full YAML parser. Supported value shapes:

- Quoted strings: `key: "value"` or `key: 'value'` (quotes stripped).
- Unquoted strings: `key: value` (used rarely; whitespace-trimmed).
- Bare arrays: `key: ["a", "b"]` — no nesting, no multi-line arrays.
- Bare numbers: an unquoted (or quoted) value that parses with
  `Number(value)` is stored as a number, e.g. `cookTime: 30`.

Required fields:

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | Kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`), unique across the corpus, and equal to the filename without `.md` (`chana-dal.md` → `id: "chana-dal"`). Used for lookups, URLs, and as the `daily_meals.recipe_id` foreign reference into the markdown corpus (see [tech.spec.md](tech.spec.md)). |
| `title` | string | Non-empty. Human-readable recipe name. |
| `imageUrl` | string | Key must be present; value may be the empty string (`imageUrl: ""`) when no image is available yet — one shipped recipe (`swedish-vegan-hash-with-tofu-egg`) does this. Otherwise a filename or absolute URL. |
| `cookTime` | integer | Present, parses as an integer, `> 0`. Minutes. |
| `servings` | integer | Present, parses as an integer, `> 0`. |
| `difficulty` | enum | One of `Easy`, `Medium`, `Hard` (case-sensitive). Only `Easy` and `Medium` appear in the corpus today; `Hard` is a valid value the loader's type allows and no shipped recipe currently exercises. |
| `tags` | string array | Present, a bare `[...]` array, at least one tag, no empty-string tags. Every tag must come from the controlled English vocabulary below (human decision, 2026-07-18: recipe content is English; Swedish tags had drifted into the corpus twice before this rule). The app derives a `theme` from a fixed tag→theme map at load time (`deriveTheme` in `recipeLoader.ts`). |

Controlled tag vocabulary (mirrored in `harness` `ALLOWED_TAGS`; adding
a tag means adding it in both places in the same change set):

> Asian · Basque · Batch · BBQ · Budget · Casserole · Chickpea ·
> Chinese · Climate Smart · Comfort Food · Dal · Dinner · Family ·
> Fresh · Garlic · Greek · Hash · Indian · Italian · Japanese ·
> Lebanese · Lentil · Lunch · Luxury · Meal Prep · Mexican ·
> Middle Eastern · Mixed Lentils · Noodles · One-Pot · Paneer · Party ·
> Pasta · Quick · Red Lentil · Saffron · Sichuan · Soup · Spicy ·
> Spinach · Stew · Stroganoff · Summer · Sushi · Swedish · Tacos ·
> Tofu · Vegan · Vegan-Option · Vegetarian · Vietnamese ·
> Weekend Project · Weeknight

Optional fields:

| Field | Type | Rule |
| --- | --- | --- |
| `url` | string | Original source URL, if imported. Every shipped recipe currently sets it (even if empty), but the loader's type marks it optional and the validator does not require it. |

Fields the loader's `ParsedRecipe` type declares but the frontmatter
parser never populates (`description`, `nutritionInfo`) are out of scope
for this spec and the validator — see Non-goals in
[p1-05-validate-recipe](../execplans/p1-05-validate-recipe.md).

## Body: `## Ingredients`

A Markdown table immediately after the `## Ingredients` heading (one
blank line, then the table). Columns, in order:

```
| quantity | unit | key | ingredient | notes |
|----------|------|-----|------------|-------|
```

- The header row and the separator row (`|---|---|...`) are both
  required; parsing starts two lines after the first line beginning with
  `|`.
- At least one data row is required.
- Each data row is split on `|`; the parser keeps the trimmed cell
  values at positions 1–5 (position 0 is the empty string before the
  leading `|`). A row with fewer than 5 `|`-delimited cells is skipped
  by the loader (silently dropped) — the validator treats this as a
  failure instead, since a silently-dropped ingredient is exactly the
  bug class this spec exists to catch.
- `quantity`, `unit`, and `notes` may be empty (e.g. a "to serve"
  garnish with no quantity). `key` and `ingredient` must be non-empty:
  `ingredient` is the display name; `key` is a stable slug used to
  reference the same ingredient consistently (shopping-list grouping).
- Column alignment/padding with spaces is cosmetic only — both `| --- |`
  and `|---|` header-separator styles appear in the shipped corpus and
  both parse identically.

## Body: `## Instructions`

An ordered Markdown list immediately after the `## Instructions` heading.
Only lines matching `^\d+\.\s*(.+)$` are collected as steps; any other
line inside the section (blank lines, prose asides) is ignored by the
loader. At least one numbered step is required. In the shipped corpus
every recipe's step numbers are sequential starting at 1
(`1. 2. 3. ...`); the validator enforces this as a content-quality check
even though the loader itself does not depend on step numbers being
sequential (it discards the number and keeps only the step text).
Emojis in step text are encouraged (playful tone,
[conventions.spec.md](conventions.spec.md)) but not required or
validated.

## Body: `## Notes` (optional)

If present, a Markdown bullet list (`- ...`) immediately after the
`## Notes` heading; each `- ` line becomes one note string. The loader
treats a missing `## Notes` section as zero notes, not an error. Every
recipe in the shipped corpus currently has a Notes section, but the
validator does not require one.

## What is not validated

- Nutrition data (`nutritionInfo`): no schema exists yet (non-goal of
  `p1-05-validate-recipe`).
- Tag vocabulary: tags are free text; `deriveTheme`'s tag→theme map is
  best-effort and a tag with no match falls back to `"Vegan Favorites"`.
- Image reachability: `imageUrl` is checked for presence/shape only, not
  fetched.
- Markdown prose quality inside instruction/note text.

## Discrepancies found while writing this spec

`recipeLoader.ts`'s behavior and the corpus agree in every case checked
except one, found only once the validator (built against the frontmatter
shape documented above — single-line `key: [...]` arrays) was run over
all 18 files:

- **`src/data/recipes/vegan-dan-dan-noodles.md` wraps its `tags` array
  onto a second line:**

  ```
  tags:
    ["Chinese", "Asian", "Noodles", "Vegan", "Lunch", "Dinner", "Climate Smart"]
  ```

  `parseFrontmatter`'s line-oriented parser only reads a value from the
  same line as its `key:`; the continuation line has no `:` and is
  silently skipped entirely (`if (colonIndex === -1) continue;`). The
  result actually loaded into the running app: `frontmatter.tags === ""`
  (the empty string, from the bare `tags:` line), which
  `parseRecipeMarkdown`'s `frontmatter.tags || []` then coerces to an
  **empty array** — all 7 intended tags are silently dropped, and
  `deriveTheme([])` falls back to `"Vegan Favorites"` instead of the
  `"Asian Fusion"` the `Chinese`/`Sichuan`/`Thai` tag map would have
  produced. Reproduction: see `p1-05-validate-recipe`'s Evidence section.

  This is a loader/corpus disagreement in the sense that the file's
  *author* clearly intended `tags` to carry 7 values (matching every
  other recipe's tag count) and the *loader* silently gives it zero —
  but it is not a disagreement about what the format *should be*: the
  single-line-array shape documented above is what every one of the
  other 17 recipes uses and what the hand-rolled parser is built for.

  **Resolved 2026-07-17** (orchestrator ruling in
  `p1-05-validate-recipe`): by fixing the file — the `tags` array was
  collapsed onto one line, content preserved. The parser was not
  changed; single-line `key: [...]` arrays remain the only supported
  array shape, and `./harness validate-recipe` (now part of
  `./harness check`) rejects continuation-line values.
