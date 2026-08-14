---
id: p2-03-fill-placeholder-recipes
title: Fill in the nine placeholder recipes with complete content
phase: P2
status: in-progress
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

- [x] fredagsmys-tacos drafted (mince + spice from scratch, topping
      bar as ingredient rows, tortilla warming)
- [x] summer-rolls-peanut-sauce drafted (roll technique steps, sauce
      ratios, make-ahead notes)
- [x] vegan-sushi-rolls drafted (rice seasoning ratios, 2-3 filling
      variations, rolling steps)
- [x] vegan-meatballs-creamed-macaroni drafted (meatball choice or
      from-scratch, stuvade makaroner bechamel-in-pot method, citrus
      spinach)
- [x] vegan-meatballs-brown-sauce drafted (meatballs + boiled potatoes;
      brunsås imported from the wondervegan source; pressgurka imported
      from the javligtgott source; lingonberry jam as accompaniment)
- [x] peanut-noodles-tofu drafted (peanut sauce ratios, crispy tofu or
      vegan chicken option, kid-mild with optional heat)
- [x] vegan-dillkott-potatoes drafted (dill sauce: oat cream +
      vinegar/sugar balance; soy chunks or oumph)
- [x] oumph-bourguignon drafted (wine reduction, mushroom/pearl-onion
      technique, batch/freezer notes)
- [x] vegan-kalpudding drafted (caramelized cabbage with syrup, mince
      layer, bake times, lingon + gravy to serve)
- [x] mechanical checks green; drafts handed to the human
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

**2026-08-15 (drafts, mechanical checks):**

- All nine recipes drafted in place; ids/titles/tags unchanged; no new
  tags needed (controlled vocabulary sufficed for every draft).
  cookTime adjusted where the drafted content demanded it:
  `vegan-meatballs-brown-sauce` 45 → 60 (pressgurka press + brine
  time), `vegan-kalpudding` 75 → 90 (caramelizing + bake + rest);
  the other seven kept their skeleton values.
- Imported components, translated + converted to the table format per
  the plan: brunsås from wondervegan.se (2 msk plant butter / 1 msk
  flour / 3,5 dl plant cream / 1,5 tsk lingon / 1,5 tsk Chinese soy /
  0,5 bouillon cube, quantities kept as published) and pressgurka from
  the PRESSGURKA section of javligtgott.se (1 cucumber / 3 krm salt →
  0.5 tsp / 2 msk ättika 12 % / 1 dl water / 3 msk sugar / white
  pepper / parsley). Source attribution recorded in that recipe's
  Notes.
- Swedish-household style throughout: metric units, SEK-market brands
  (Anamma, Hälsans Kök, oumph, ljus sirap, ättika), kid-friendly heat
  (chili always optional/on the side — tacos, peanut noodles, summer
  rolls), batch/leftover notes on the batch-tagged dishes
  (bourguignon, kålpudding) and make-ahead notes elsewhere.
- Verification run: `grep -r PLACEHOLDER src/data/recipes/` → empty
  (exit 1). `./harness check` → deps OK (73), lint OK, test OK,
  build OK, tsc bot OK, plans validate OK (18), validate-recipe
  OK (30 recipes). All green 2026-08-15.

(human review of the nine drafts pending — required before `done`)
