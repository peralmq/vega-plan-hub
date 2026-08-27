// Seed data for mock-auth mode. Pure function, no top-level side effects —
// invoked lazily from src/mocks/mockClient.ts. Uses real recipe ids from
// src/data/recipes/ (via loadAllRecipes) so recipe lookups in the hooks
// (recipe_id -> markdown recipe) resolve to real content instead of dangling
// ids.

import type { ParsedRecipe } from "@/services/recipeLoader";
import { MockStore, type SeedPoolMeal } from "./mockStore";

const AVATAR_COLORS = ["#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#3B82F6"];

export function seedMockStore(store: MockStore, recipes: ParsedRecipe[]): void {
  if (recipes.length === 0) return;
  const pick = (i: number) => recipes[i % recipes.length].id;

  // Active batch: a 5-day pool (p4-03's first-production-batch shape,
  // directive 2026-08-27) with one already-cooked dish (yesterday), a
  // meal-prep pair (same recipe twice → 🍱 ×2), and varied multipliers so
  // Cook Mode, Plan Mode, and Shopping Summary all render meaningful state.
  const activeMeals: SeedPoolMeal[] = [
    { recipeId: pick(0), servingsMultiplier: 1, cookedOn: store.isoDaysFromToday(-1) },
    { recipeId: pick(1), servingsMultiplier: 2 },
    { recipeId: pick(2), servingsMultiplier: 1 },
    { recipeId: pick(3), servingsMultiplier: 1.5 },
    { recipeId: pick(3), servingsMultiplier: 1.5 }, // meal prep: same dish twice
  ];
  store.seedBatch(store.isoDaysFromToday(-1), store.isoDaysFromToday(3), activeMeals);

  // Next batch: a smaller upcoming pool, not yet actionable from the web
  // (locking/editing the next batch is chat's job — p4-03) but present so
  // the data layer's current+next fetch has something to prove.
  const nextMeals: SeedPoolMeal[] = [
    { recipeId: pick(7), servingsMultiplier: 1 },
    { recipeId: pick(8), servingsMultiplier: 1 },
  ];
  store.seedBatch(store.isoDaysFromToday(4), store.isoDaysFromToday(8), nextMeals);

  const familyMember = store.seedFamilyMember("Mock Kid 🧒", AVATAR_COLORS[0]);
  store.seedRating(pick(0), familyMember.id, 5);
  store.seedComment(pick(0), "Family favorite, always a hit! 💚");
}
