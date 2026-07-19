---
id: p2-03-fill-placeholder-recipes
title: Fill in the nine placeholder recipes with complete content
phase: P2
status: todo
depends_on: []
---

## Goal

Replace the placeholder skeletons with complete, cookable recipes:

- `fredagsmys-tacos.md` — the Friday-night taco spread
- `summer-rolls-peanut-sauce.md` — fresh rolls + peanut dipping sauce
- `vegan-sushi-rolls.md` — assorted roll variations
- `vegan-meatballs-creamed-macaroni.md` — meatballs, stuvade makaroner,
  citrus-dressed spinach
- `vegan-meatballs-brown-sauce.md` — meatballs, boiled potatoes,
  brunsås, lingonberry jam, pressgurka. Unlike the other four, two
  components have sources to import (translate to English, convert to
  the table format): the brunsås from
  https://wondervegan.se/sv/vegansk-graddsas-brunsas/ and the
  pressgurka from the PRESSGURKA section of
  https://javligtgott.se/recept/kottbullar-med-graddsas-och-hasselbackspotatis/
- `peanut-noodles-tofu.md` — jordnötsnudlar: noodles in creamy peanut
  sauce with crispy tofu or vegan chicken
- `vegan-dillkott-potatoes.md` — dillkött med potatis: chunks in
  tangy-sweet dill sauce, boiled potatoes
- `oumph-bourguignon.md` — red-wine stew with oumph, mushrooms, pearl
  onions
- `vegan-kalpudding.md` — kålpudding: caramelized cabbage + vegan
  mince bake, lingon to serve

Each ends up indistinguishable in quality from the imported recipes:
full ingredient table with real quantities, numbered instructions a
first-timer can cook from, sensible cookTime/servings/difficulty, Notes
with batch/leftover guidance where relevant.

## Non-goals

- No new recipes beyond these nine; no edits to other recipe files.
- No format or vocabulary changes — the recipe contract
  ([recipe-format.spec.md](../specs/recipe-format.spec.md)) and the
  controlled tag list are fixed; if a draft genuinely needs a new tag,
  stop and report rather than adding one.
- No replacing the stock Unsplash images unless a better free-to-use
  image URL is at hand (image curation is not the point of this plan).

## Context

The first four files were committed 2026-07-18 (commit `7df4ef0`), the
fifth (`vegan-meatballs-brown-sauce.md`) later the same day — all
spec-valid skeletons: a few core ingredient rows and a single
`PLACEHOLDER` instruction each, so they render in the app but cannot be
cooked from. They are family dishes without a single source URL (the
`url` frontmatter field is intentionally absent; the fifth has two
*component* sources listed in its Notes and in the Goal above), so
content comes from drafting a canonical version of each dish —
Swedish-household style
(metric units, SEK-market ingredients, kid-friendly heat levels per
[product.spec.md](../specs/product.spec.md)) — rather than importing.
English throughout, per the 2026-07-18 language decision;
`./harness validate-recipe` enforces structure and the tag vocabulary.

**These are the repo owner's family dishes: the drafts are proposals.**
This plan's Verification therefore requires human review of the content
(taste, style, how the household actually makes them) — an implementer
runs the mechanical checks and hands the drafts over; the plan is
`done` only after the human has reviewed each recipe (editing directly
or approving as-is) and that feedback is recorded in Evidence.

## Progress

- [ ] fredagsmys-tacos drafted (mince + spice from scratch, topping
      bar as ingredient rows, tortilla warming)
- [ ] summer-rolls-peanut-sauce drafted (roll technique steps, sauce
      ratios, make-ahead notes)
- [ ] vegan-sushi-rolls drafted (rice seasoning ratios, 2-3 filling
      variations, rolling steps)
- [ ] vegan-meatballs-creamed-macaroni drafted (meatball choice or
      from-scratch, stuvade makaroner bechamel-in-pot method, citrus
      spinach)
- [ ] vegan-meatballs-brown-sauce drafted (meatballs + boiled potatoes;
      brunsås imported from the wondervegan source; pressgurka imported
      from the javligtgott source; lingonberry jam as accompaniment)
- [ ] peanut-noodles-tofu drafted (peanut sauce ratios, crispy tofu or
      vegan chicken option, kid-mild with optional heat)
- [ ] vegan-dillkott-potatoes drafted (dill sauce: oat cream +
      vinegar/sugar balance; soy chunks or oumph)
- [ ] oumph-bourguignon drafted (wine reduction, mushroom/pearl-onion
      technique, batch/freezer notes)
- [ ] vegan-kalpudding drafted (caramelized cabbage with syrup, mince
      layer, bake times, lingon + gravy to serve)
- [ ] mechanical checks green; drafts handed to the human
- [ ] human review recorded per recipe; status flipped to done

## Steps

1. Draft each recipe in place (replacing the PLACEHOLDER rows and
   instruction), keeping the existing id/title/tags; adjust cookTime,
   servings, difficulty to match the drafted content.
2. Run `./harness check` (validate-recipe covers format + tags) and
   `./harness test` (loader tests parse every recipe).
3. Optionally sanity-render one recipe in `./harness dev-mock` to
   confirm table/instruction display.
4. Hand the four drafts to the human for content review; record their
   verdict (approved / edited) per recipe in Evidence; only then set
   status `done`.

## Verification

- `./harness check` green (includes validate-recipe over the full
  corpus).
- No `PLACEHOLDER` string remains in `src/data/recipes/`
  (`grep -r PLACEHOLDER src/data/recipes/` is empty).
- Each recipe is cookable as written: complete quantities, no
  dangling references, instructions sequential and self-contained.
- **Human review of all nine drafts recorded in Evidence** — required
  before `done`; the mechanical checks alone cannot complete this plan.

## Evidence

(appended during implementation)
