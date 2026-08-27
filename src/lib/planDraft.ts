// p4-03 step 3: the draft proposer — a simple, deterministic heuristic over
// ratings + recency (the plan's Non-goals rule out draft-quality ML: this only
// has to be "good enough to edit against"). Determinism is a testability
// requirement, not a nicety: the seed makes a draft replayable, so the
// conversation fixtures can assert exact dishes, and [🎲 Ny dragning] can
// promise a genuinely different list.
//
// Pool shape (tech.spec "Pool model", directive 2026-08-27): the output is a
// LIST OF MEALS WITH COUNTS — no day assignment anywhere. A meal prep is the
// same recipe_id twice, which is why a 5-day horizon proposes 4 distinct
// dishes in 5 entries; the shared aggregation then scales the shopping list
// correctly with no extra concept.

export interface DraftCandidate {
  id: string;
  title: string;
  tags: string[];
}

export interface DraftEntry {
  recipeId: string;
  servingsMultiplier: number;
}

export interface ProposeDraftInput {
  recipes: DraftCandidate[];
  /** Average household rating (1–5) per recipe id; absent = unrated. */
  ratings: Map<string, number>;
  /** yyyy-MM-dd the dish was last cooked/planned; absent = never. */
  lastCooked: Map<string, string>;
  horizonDays: number;
  todayIso: string;
  /** Any stable string; the same seed always yields the same draft. */
  seed: string;
  /** Recipe ids to leave out (a reroll excludes the draft it replaces). */
  exclude?: string[];
}

// A.3 verdict, filled 2026-08-27: the household's default horizon is 5 days,
// and [5 dagar] is the first button.
export const DEFAULT_HORIZON_DAYS = 5;
export const HORIZON_CHOICES = [5, 3, 7] as const;
export const MAX_HORIZON_DAYS = 14;

// Horizons of 4+ days earn one meal-prep pair (directive: the first
// production batch is 5 days including one meal prep).
export const MEAL_PREP_MIN_HORIZON = 4;

export function distinctDishCount(horizonDays: number): number {
  return horizonDays >= MEAL_PREP_MIN_HORIZON ? horizonDays - 1 : horizonDays;
}

// Suitability for cooking once and eating twice, from the controlled tag
// vocabulary (recipe-format.spec.md). Stews/dals/soups first, per the
// directive; 0 means "not a meal-prep dish" (tacos, sushi, summer rolls).
const MEAL_PREP_TAG_WEIGHTS: Record<string, number> = {
  "Meal Prep": 4,
  Batch: 4,
  Stew: 3,
  Dal: 3,
  Soup: 3,
  Casserole: 2.5,
  "One-Pot": 2,
  Curry: 2,
  "Comfort Food": 1.5,
};

export function mealPrepSuitability(tags: string[]): number {
  let best = 0;
  for (const tag of tags) best = Math.max(best, MEAL_PREP_TAG_WEIGHTS[tag] ?? 0);
  return best;
}

// Cuisine-ish tags used only for the "don't stack four dals" diversity rule.
const CUISINE_TAGS = new Set([
  "Indian", "Chinese", "Sichuan", "Italian", "Mexican", "Swedish", "French",
  "Greek", "Japanese", "Lebanese", "Vietnamese", "Basque", "Asian",
  "Middle Eastern", "Thai",
]);
const MAX_PER_CUISINE = 2;

function cuisineOf(recipe: DraftCandidate): string | null {
  return recipe.tags.find((t) => CUISINE_TAGS.has(t)) ?? null;
}

// ---------------------------------------------------------------------------
// Date helpers (plain arithmetic on yyyy-MM-dd in UTC — the household's dates
// are wall-clock labels, never instants, so no timezone can shift them).

const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY_MS);
}

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

// "planera fram till söndag" → how many days that covers, counting from today
// (never zero: the same weekday means a week out). The batch's real start date
// is derived at LOCK time from what is already covered, so this is only ever a
// meal count.
export function daysUntilWeekday(todayIso: string, weekday: string): number | null {
  const target = WEEKDAYS.indexOf(weekday.toLowerCase().trim());
  if (target === -1) return null;
  const today = new Date(toUtc(todayIso)).getUTCDay();
  const diff = (target - today + 7) % 7;
  return diff === 0 ? 7 : diff;
}

export function clampHorizon(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_HORIZON_DAYS;
  return Math.max(1, Math.min(MAX_HORIZON_DAYS, Math.round(days)));
}

// ---------------------------------------------------------------------------
// Scoring

// FNV-1a → [0,1). A hash, not randomness: same seed + id, same jitter forever.
function jitter(seed: string, id: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${seed}::${id}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

const UNRATED_BONUS = 0.4; // curiosity: an untried dish beats a mediocre one
const RECENCY_CAP_DAYS = 60;

export function scoreRecipe(
  recipe: DraftCandidate,
  input: Pick<ProposeDraftInput, "ratings" | "lastCooked" | "todayIso" | "seed">,
): number {
  const rating = input.ratings.get(recipe.id);
  const ratingScore = rating == null ? UNRATED_BONUS : rating - 3;
  const last = input.lastCooked.get(recipe.id);
  const daysSince = last == null ? RECENCY_CAP_DAYS : daysBetween(last, input.todayIso);
  const recencyScore =
    (Math.max(0, Math.min(RECENCY_CAP_DAYS, daysSince)) / RECENCY_CAP_DAYS) * 2;
  return ratingScore + recencyScore + jitter(input.seed, recipe.id) * 0.5;
}

// ---------------------------------------------------------------------------

export function proposeDraft(input: ProposeDraftInput): DraftEntry[] {
  const excluded = new Set(input.exclude ?? []);
  const ranked = input.recipes
    .filter((r) => !excluded.has(r.id))
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, input) }))
    .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id));
  if (ranked.length === 0) return [];

  const horizon = clampHorizon(input.horizonDays);
  const wanted = Math.min(distinctDishCount(horizon), ranked.length);

  // Pass 1: top scorers, at most MAX_PER_CUISINE of any one cuisine.
  const perCuisine = new Map<string, number>();
  const picks: typeof ranked = [];
  for (const candidate of ranked) {
    if (picks.length === wanted) break;
    const cuisine = cuisineOf(candidate.recipe);
    if (cuisine) {
      const used = perCuisine.get(cuisine) ?? 0;
      if (used >= MAX_PER_CUISINE) continue;
      perCuisine.set(cuisine, used + 1);
    }
    picks.push(candidate);
  }
  // Pass 2: a small library can starve the diversity rule — fill the rest in
  // rank order rather than proposing fewer meals than asked for.
  for (const candidate of ranked) {
    if (picks.length === wanted) break;
    if (!picks.includes(candidate)) picks.push(candidate);
  }

  const entries: DraftEntry[] = picks.map((p) => ({
    recipeId: p.recipe.id,
    servingsMultiplier: 1,
  }));
  if (horizon < MEAL_PREP_MIN_HORIZON || entries.length === 0) return entries;

  // The meal-prep pair: the best batch-friendly dish among the picks. When
  // nothing picked is suitable, swap the weakest pick for the best suitable
  // dish in the library — a 5-day batch should get its 🍱 pair.
  let prepIndex = -1;
  let prepRank = 0;
  picks.forEach((p, i) => {
    const suitability = mealPrepSuitability(p.recipe.tags);
    if (suitability > prepRank) {
      prepRank = suitability;
      prepIndex = i;
    }
  });
  if (prepIndex === -1) {
    const pickedIds = new Set(picks.map((p) => p.recipe.id));
    const replacement = ranked.find(
      (c) => !pickedIds.has(c.recipe.id) && mealPrepSuitability(c.recipe.tags) > 0,
    );
    if (replacement) {
      prepIndex = entries.length - 1;
      entries[prepIndex] = { recipeId: replacement.recipe.id, servingsMultiplier: 1 };
    } else {
      prepIndex = 0; // no batch-friendly dish exists: double the top pick
    }
  }
  entries.splice(prepIndex + 1, 0, { ...entries[prepIndex] });
  return entries;
}
