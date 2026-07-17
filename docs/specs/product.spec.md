# Product Spec — Vega Plan Hub

Status: binding. Extracted 2026-07-17 from the shipped app (commit
`fe922eb`) as part of execplan `p1-01-spec-extraction`. Problem and
behavior only; solutions live in [tech.spec.md](tech.spec.md), UX in
[design.spec.md](design.spec.md).

## Problem

Feeding a household vegan meals every week has three recurring chores
that eat time and goodwill:

1. **Deciding what to cook** — the same question every week, for every
   family member's tastes.
2. **Shopping for it** — translating seven recipes into one de-duplicated
   grocery list, with quantities scaled to actual appetites and
   leftovers strategy, priced in SEK.
3. **Cooking it** — on a weekday evening you want tonight's recipe, at
   the right portion size, and nothing else in your face.

Vega Plan Hub solves this for a Swedish vegan household: plan a week in
minutes, get one shoppable list, cook from a focused view.

## Users

- **The planner** — the household member who sets up next week's meals
  and does the shopping. Values speed and a trustworthy list.
- **The cook** — whoever is cooking tonight (may be the same person).
  Values tonight-first focus, portion scaling, and step-by-step clarity.
- Accounts are per-household user (Supabase auth); family members are
  modeled so tastes and ratings can be tracked per person.

## Jobs to be done / core behavior

| Job | Behavior the app must provide |
| --- | --- |
| Plan next week | Pick a recipe per weekday from the curated recipe library; adjust servings multiplier per day (e.g. double for leftovers); plans persist per calendar week (Monday-start, current + next week). |
| Cook tonight | Default view is today's planned meal: ingredients scaled to the day's multiplier, instructions step-by-step, link to the original recipe. |
| Shop for the week | One aggregated shopping list across the week's recipes: ingredients normalized (aliases merged), units converted and summed, printable and copyable, with SEK price estimates. |
| Keep the library good | Recipes are curated markdown files in the repo (not user-generated); family members can rate and comment on recipes to inform future planning. |

## Success criteria

- Planning a full week takes minutes, not an evening.
- The shopping list is trustworthy enough to shop from without opening
  individual recipes (normalization + scaling are correct).
- The app *feels* fun: playful copy, emojis, vibrant design — this is a
  product requirement, not decoration.
- Swedish market fit: SEK prices, metric units, Swedish ingredient
  availability.

## Non-goals

- Not a recipe social network: no public sharing, no user-generated
  recipe uploads through the UI; the library is curated in-repo.
- Not a general grocery app: prices are estimates for planning, not a
  checkout integration (the Mathem price service is a mock — see
  tech.spec.md).
- No meat/dairy: the library is vegan by definition.
- No native mobile app; responsive web only.

## Open questions

- Real grocery-price integration (Mathem or other) vs. keeping estimates
  mock — currently mock, undecided.
- Whether past weeks' plans should be browsable (history) — currently
  only current + next week are modeled.
