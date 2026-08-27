import type { ParsedRecipe } from "@/services/recipeLoader";

// p4-11: Cook Mode deep-link contract — `/?recipe=<markdown recipe id>&x=<multiplier>`
// (design.spec.md, Cook Mode). Pure parsing/resolution helpers, unit-tested
// independently of the CookMode component's day-selection state machine.

// The app's allowed servings-multiplier range (matches PlanMode's ± stepper
// clamp, src/pages/PlanMode.tsx).
export const MIN_SERVINGS_MULTIPLIER = 0.5;
export const MAX_SERVINGS_MULTIPLIER = 4;

export function clampServingsMultiplier(x: number): number {
  return Math.max(MIN_SERVINGS_MULTIPLIER, Math.min(MAX_SERVINGS_MULTIPLIER, x));
}

/**
 * Resolve `?recipe=<id>` against the recipe library. An absent or unknown id
 * resolves to `undefined` — the caller falls back to normal Cook Mode (plus
 * a friendly toast for the unknown-id case; never a crash).
 */
export function findDeepLinkRecipe(
  recipes: ParsedRecipe[],
  recipeIdParam: string | null,
): ParsedRecipe | undefined {
  if (!recipeIdParam) return undefined;
  return recipes.find((r) => r.id === recipeIdParam);
}

/**
 * Resolve `?x=<multiplier>`. A present, finite value is clamped to the app's
 * allowed range. An absent or unparseable ("bad") value falls back to
 * `defaultMultiplier` — the caller computes that as the planned meal's own
 * multiplier when the recipe is in the active plan, else 1.
 */
export function resolveServingsMultiplier(
  xParam: string | null,
  defaultMultiplier: number,
): number {
  if (xParam === null || xParam.trim() === "") return defaultMultiplier;
  const parsed = Number(xParam);
  if (!Number.isFinite(parsed)) return defaultMultiplier;
  return clampServingsMultiplier(parsed);
}
