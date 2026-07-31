// Pure date logic for the rolling meal plan (p4-01): planned_meals rows are
// keyed by calendar date; the web UI renders week windows over them. All
// functions are local-time (the household plans in their own timezone) and
// return ISO yyyy-MM-dd strings for DB values.

import { startOfWeek, addDays, format } from "date-fns";

export interface WeekMeal {
  dayOfWeek: number; // 0=Monday .. 6=Sunday
  recipeId: string;
  servingsMultiplier: number;
}

export interface PlannedMealRowLike {
  meal_date: string; // yyyy-MM-dd
  recipe_id: string;
  servings_multiplier: number | null;
}

export const toISODate = (d: Date): string => format(d, "yyyy-MM-dd");

export const mondayOf = (d: Date): Date => startOfWeek(d, { weekStartsOn: 1 });

// The backfill arithmetic: week_start (a Monday) + day_of_week (0..6) → date.
export const dateForDayOfWeek = (weekMonday: Date, dayOfWeek: number): string =>
  toISODate(addDays(weekMonday, dayOfWeek));

export const weekWindow = (weekMonday: Date): { start: string; end: string } => ({
  start: toISODate(weekMonday),
  end: toISODate(addDays(weekMonday, 6)),
});

export function dayOfWeekWithin(isoDate: string, weekMonday: Date): number | null {
  for (let day = 0; day < 7; day++) {
    if (dateForDayOfWeek(weekMonday, day) === isoDate) return day;
  }
  return null;
}

export function rowsToWeekMeals(
  rows: PlannedMealRowLike[],
  weekMonday: Date,
): WeekMeal[] {
  return rows
    .map((row) => ({
      dayOfWeek: dayOfWeekWithin(row.meal_date, weekMonday),
      recipeId: row.recipe_id,
      servingsMultiplier: row.servings_multiplier ?? 1,
    }))
    .filter((m): m is WeekMeal => m.dayOfWeek !== null)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

export function todayIndex(now: Date = new Date()): number {
  const jsDay = now.getDay(); // Sunday=0
  return jsDay === 0 ? 6 : jsDay - 1;
}
