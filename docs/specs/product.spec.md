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

*(Revised 2026-07-31 at the chat-first gate — see
docs/research/gate-brief.md. The product extends to a conversational
Telegram assistant; planning moves from calendar weeks to rolling
batches. Implementation lands in phase P4; until then the shipped app
still behaves per the previous week-based rows, recorded in git
history.)*

| Job | Behavior the product must provide |
| --- | --- |
| Plan the next X days | In chat: the household asks to plan a horizon ("next 5 days"); the assistant proposes a draft from the library (ratings, recency), the humans edit by tap or text, then **lock the batch** — the unit of both cooking and shopping. Plans persist per date; the web shows a week-window view. |
| Capture as you live | "köp mjölk" in chat, from either partner, adds to one shared persisted shopping list — instantly, with an emoji-reaction confirmation and no follow-up questions in the common case. |
| Cook tonight | Today's planned meal: ingredients scaled to the day's multiplier, step-by-step instructions, link to the original recipe. Chat answers "what's for dinner?" with a summary card deep-linking the web cook mode (the big-screen surface). |
| Shop the batch | One aggregated list per locked batch plus ad-hoc items: ingredients normalized (aliases merged), units converted and summed, **preference-resolved** ("mjölk" → the currently preferred product), check-off shared live between partners, printable, with SEK estimates. |
| Learn the household | The assistant learns product preferences over time (explicit "we switched", corrections, observation) into inspectable, editable facts — never opaque memory. Family members rate and comment to inform future drafts. |
| Keep the library good | Recipes are curated markdown files in the repo (not user-generated). |

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
- No native mobile app. (Revised 2026-07-31: the primary interaction
  surface becomes the Telegram assistant; the web app remains
  first-class for cook mode, recipe library, admin, and print — see
  docs/research/r5-surface-split.md. "Responsive web only" is
  retired.)

## Open questions

- Real grocery-price integration (Mathem or other) vs. keeping estimates
  mock — currently mock, undecided.
- Whether past weeks' plans should be browsable (history) — currently
  only current + next week are modeled.
