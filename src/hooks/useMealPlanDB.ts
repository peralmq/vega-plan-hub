import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { loadAllRecipes, ParsedRecipe } from '@/services/recipeLoader';
import { addWeeks, format } from 'date-fns';
import {
  mondayOf,
  weekWindow,
  dateForDayOfWeek,
  rowsToWeekMeals,
  todayIndex,
  PlannedMealRowLike,
} from '@/lib/planDates';

export interface DayMeal {
  dayOfWeek: number; // 0-6 (Monday-Sunday)
  recipeId: string;
  recipe?: ParsedRecipe;
  servingsMultiplier: number; // 1.0 = normal, 2.0 = double portions for leftovers
}

export interface WeeklyMealPlan {
  id: string;
  weekStart: Date;
  meals: DayMeal[];
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Get current week's Monday
function getCurrentWeekMonday(): Date {
  return mondayOf(new Date());
}

// Get next week's Monday
function getNextWeekMonday(): Date {
  return addWeeks(getCurrentWeekMonday(), 1);
}

// p4-01: plans are date-keyed rows in planned_meals (rolling horizon); this
// hook renders the current + next calendar-week windows over them so the
// existing pages keep their WeeklyMealPlan-shaped interface.
export function useMealPlanDB() {
  const { user } = useAuth();
  const [currentWeekPlan, setCurrentWeekPlan] = useState<WeeklyMealPlan | null>(null);
  const [nextWeekPlan, setNextWeekPlan] = useState<WeeklyMealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [allRecipes] = useState<ParsedRecipe[]>(() => loadAllRecipes());

  // Fetch planned meals covering the current + next week windows
  const fetchMealPlans = useCallback(async () => {
    if (!user) {
      setCurrentWeekPlan(null);
      setNextWeekPlan(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const currentMonday = getCurrentWeekMonday();
      const nextMonday = getNextWeekMonday();
      const { start } = weekWindow(currentMonday);
      const { end } = weekWindow(nextMonday);

      const { data: rows, error } = await supabase
        .from('planned_meals')
        .select('id, meal_date, recipe_id, servings_multiplier')
        .gte('meal_date', start)
        .lte('meal_date', end);

      if (error) throw error;

      const toWeekPlan = (monday: Date): WeeklyMealPlan | null => {
        const meals = rowsToWeekMeals((rows ?? []) as PlannedMealRowLike[], monday).map(m => ({
          ...m,
          recipe: allRecipes.find(r => r.id === m.recipeId),
        }));
        if (meals.length === 0) return null;
        return { id: `week-${format(monday, 'yyyy-MM-dd')}`, weekStart: monday, meals };
      };

      setCurrentWeekPlan(toWeekPlan(currentMonday));
      setNextWeekPlan(toWeekPlan(nextMonday));
    } catch (error) {
      console.error('Error fetching meal plans:', error);
    } finally {
      setLoading(false);
    }
  }, [user, allRecipes]);

  useEffect(() => {
    fetchMealPlans();
  }, [fetchMealPlans]);

  // Meal data with multiplier
  interface MealData {
    recipeId: string;
    servingsMultiplier: number;
  }

  // Save a week's meals: clear the week window, then upsert date rows
  const saveMealPlan = async (meals: Map<number, MealData>, weekMonday: Date) => {
    if (!user) throw new Error('Must be logged in');

    const { start, end } = weekWindow(weekMonday);

    const { error: deleteError } = await supabase
      .from('planned_meals')
      .delete()
      .eq('user_id', user.id)
      .gte('meal_date', start)
      .lte('meal_date', end);
    if (deleteError) throw deleteError;

    const rows = Array.from(meals.entries()).map(([dayOfWeek, data]) => ({
      user_id: user.id,
      meal_date: dateForDayOfWeek(weekMonday, dayOfWeek),
      recipe_id: data.recipeId,
      servings_multiplier: data.servingsMultiplier,
    }));

    if (rows.length > 0) {
      const { error } = await supabase
        .from('planned_meals')
        .upsert(rows, { onConflict: 'user_id,meal_date' });
      if (error) throw error;
    }

    // Refresh data
    await fetchMealPlans();

    return start;
  };

  // Save a complete meal plan for next week
  const saveNextWeekPlan = async (meals: Map<number, MealData>) => {
    return saveMealPlan(meals, getNextWeekMonday());
  };

  // Save a meal plan for current week
  const saveCurrentWeekPlan = async (meals: Map<number, MealData>) => {
    return saveMealPlan(meals, getCurrentWeekMonday());
  };

  // Get recipe for a specific day in current week
  const getRecipeForDay = (dayOfWeek: number): ParsedRecipe | undefined => {
    const meal = currentWeekPlan?.meals.find(m => m.dayOfWeek === dayOfWeek);
    return meal?.recipe;
  };

  // Get today's recipe
  const getTodaysRecipe = (): ParsedRecipe | undefined => {
    return getRecipeForDay(todayIndex());
  };

  // Get remaining meals for current week (today and forward)
  const getRemainingMeals = (): DayMeal[] => {
    if (!currentWeekPlan) return [];
    const dayOfWeek = todayIndex();
    return currentWeekPlan.meals
      .filter(m => m.dayOfWeek >= dayOfWeek)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  };

  // Check if next week plan exists
  const hasNextWeekPlan = (): boolean => {
    return nextWeekPlan !== null && nextWeekPlan.meals.length > 0;
  };

  // Check if current week has a plan
  const hasCurrentWeekPlan = (): boolean => {
    return currentWeekPlan !== null && currentWeekPlan.meals.length > 0;
  };

  // Get today's day index (0=Monday, 6=Sunday)
  const getTodayIndex = (): number => todayIndex();

  // Get current week's Monday for external use
  const getCurrentMonday = (): Date => getCurrentWeekMonday();

  // Get next week's Monday for external use
  const getNextMonday = (): Date => getNextWeekMonday();

  return {
    currentWeekPlan,
    nextWeekPlan,
    loading,
    allRecipes,
    saveNextWeekPlan,
    saveCurrentWeekPlan,
    getRecipeForDay,
    getTodaysRecipe,
    getRemainingMeals,
    hasNextWeekPlan,
    hasCurrentWeekPlan,
    refreshPlans: fetchMealPlans,
    dayNames: DAY_NAMES,
    getTodayIndex,
    getCurrentMonday,
    getNextMonday,
  };
}
