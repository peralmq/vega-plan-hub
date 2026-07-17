// Seed data for mock-auth mode. Pure function, no top-level side effects —
// invoked lazily from src/mocks/mockClient.ts. Uses real recipe ids from
// src/data/recipes/ (via loadAllRecipes) so recipe lookups in the hooks
// (recipe_id -> markdown recipe) resolve to real content instead of dangling
// ids.

import type { ParsedRecipe } from "@/services/recipeLoader";
import { MockStore, type SeedMeal } from "./mockStore";

const AVATAR_COLORS = ["#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#3B82F6"];

export function seedMockStore(store: MockStore, recipes: ParsedRecipe[]): void {
  if (recipes.length === 0) return;
  const pick = (i: number) => recipes[i % recipes.length].id;

  // Current week: full Monday-Sunday, varied servings multipliers so Cook
  // Mode, Plan Mode, and Shopping Summary all render meaningful state.
  const currentWeekMeals: SeedMeal[] = [
    { dayOfWeek: 0, recipeId: pick(0), servingsMultiplier: 1 },
    { dayOfWeek: 1, recipeId: pick(1), servingsMultiplier: 2 },
    { dayOfWeek: 2, recipeId: pick(2), servingsMultiplier: 1 },
    { dayOfWeek: 3, recipeId: pick(3), servingsMultiplier: 1.5 },
    { dayOfWeek: 4, recipeId: pick(4), servingsMultiplier: 1 },
    { dayOfWeek: 5, recipeId: pick(5), servingsMultiplier: 2 },
    { dayOfWeek: 6, recipeId: pick(6), servingsMultiplier: 1 },
  ];
  store.seedWeek(store.currentMonday(), currentWeekMeals);

  // Next week: partial (first half), so Plan Mode shows a mix of planned and
  // empty days.
  const nextWeekMeals: SeedMeal[] = [
    { dayOfWeek: 0, recipeId: pick(7), servingsMultiplier: 1 },
    { dayOfWeek: 1, recipeId: pick(8), servingsMultiplier: 1 },
    { dayOfWeek: 2, recipeId: pick(9), servingsMultiplier: 3 },
  ];
  store.seedWeek(store.nextMonday(), nextWeekMeals);

  const familyMember = store.seedFamilyMember("Mock Kid 🧒", AVATAR_COLORS[0]);
  store.seedRating(pick(0), familyMember.id, 5);
  store.seedComment(pick(0), "Family favorite, always a hit! 💚");
}
