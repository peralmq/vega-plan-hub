import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { loadAllRecipes, ParsedRecipe } from '@/services/recipeLoader';
import { startOfWeek, addWeeks, format, isSameWeek, isThisWeek } from 'date-fns';

export interface DayMeal {
  dayOfWeek: number; // 0-6 (Monday-Sunday)
  recipeId: string;
  recipe?: ParsedRecipe;
}

export interface WeeklyMealPlan {
  id: string;
  weekStart: Date;
  meals: DayMeal[];
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Get the Monday of a given week
function getWeekMonday(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

// Get next week's Monday
function getNextWeekMonday(): Date {
  return addWeeks(getWeekMonday(new Date()), 1);
}

// Get current week's Monday
function getCurrentWeekMonday(): Date {
  return getWeekMonday(new Date());
}

export function useMealPlanDB() {
  const { user } = useAuth();
  const [currentWeekPlan, setCurrentWeekPlan] = useState<WeeklyMealPlan | null>(null);
  const [nextWeekPlan, setNextWeekPlan] = useState<WeeklyMealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [allRecipes] = useState<ParsedRecipe[]>(() => loadAllRecipes());

  // Fetch meal plans for current and next week
  const fetchMealPlans = useCallback(async () => {
    if (!user) {
      setCurrentWeekPlan(null);
      setNextWeekPlan(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const currentMonday = format(getCurrentWeekMonday(), 'yyyy-MM-dd');
      const nextMonday = format(getNextWeekMonday(), 'yyyy-MM-dd');

      // Fetch both weeks' plans
      const { data: plans, error } = await supabase
        .from('meal_plans')
        .select(`
          id,
          week_start,
          daily_meals (
            id,
            day_of_week,
            recipe_id
          )
        `)
        .in('week_start', [currentMonday, nextMonday]);

      if (error) throw error;

      // Process plans
      const processedPlans = (plans || []).map(plan => {
        const meals: DayMeal[] = (plan.daily_meals || []).map((dm: any) => ({
          dayOfWeek: dm.day_of_week,
          recipeId: dm.recipe_id,
          recipe: allRecipes.find(r => r.id === dm.recipe_id),
        }));

        return {
          id: plan.id,
          weekStart: new Date(plan.week_start),
          meals,
        };
      });

      // Set current and next week plans
      setCurrentWeekPlan(processedPlans.find(p => 
        format(p.weekStart, 'yyyy-MM-dd') === currentMonday
      ) || null);
      
      setNextWeekPlan(processedPlans.find(p => 
        format(p.weekStart, 'yyyy-MM-dd') === nextMonday
      ) || null);
    } catch (error) {
      console.error('Error fetching meal plans:', error);
    } finally {
      setLoading(false);
    }
  }, [user, allRecipes]);

  useEffect(() => {
    fetchMealPlans();
  }, [fetchMealPlans]);

  // Save a complete meal plan for next week
  const saveNextWeekPlan = async (meals: Map<number, string>) => {
    if (!user) throw new Error('Must be logged in');

    const nextMonday = format(getNextWeekMonday(), 'yyyy-MM-dd');

    // First, check if plan exists
    const { data: existing } = await supabase
      .from('meal_plans')
      .select('id')
      .eq('user_id', user.id)
      .eq('week_start', nextMonday)
      .maybeSingle();

    let planId: string;

    if (existing) {
      planId = existing.id;
      // Delete existing daily meals
      await supabase
        .from('daily_meals')
        .delete()
        .eq('meal_plan_id', planId);
    } else {
      // Create new plan
      const { data: newPlan, error } = await supabase
        .from('meal_plans')
        .insert({
          user_id: user.id,
          week_start: nextMonday,
        })
        .select('id')
        .single();

      if (error) throw error;
      planId = newPlan.id;
    }

    // Insert new daily meals
    const dailyMeals = Array.from(meals.entries()).map(([dayOfWeek, recipeId]) => ({
      meal_plan_id: planId,
      day_of_week: dayOfWeek,
      recipe_id: recipeId,
    }));

    if (dailyMeals.length > 0) {
      const { error } = await supabase
        .from('daily_meals')
        .insert(dailyMeals);

      if (error) throw error;
    }

    // Refresh data
    await fetchMealPlans();

    return planId;
  };

  // Get recipe for a specific day in current week
  const getRecipeForDay = (dayOfWeek: number): ParsedRecipe | undefined => {
    const meal = currentWeekPlan?.meals.find(m => m.dayOfWeek === dayOfWeek);
    return meal?.recipe;
  };

  // Get today's recipe
  const getTodaysRecipe = (): ParsedRecipe | undefined => {
    const today = new Date().getDay();
    // Convert Sunday=0 to 6, Monday=1 to 0, etc.
    const dayOfWeek = today === 0 ? 6 : today - 1;
    return getRecipeForDay(dayOfWeek);
  };

  // Get remaining meals for current week (today and forward)
  const getRemainingMeals = (): DayMeal[] => {
    if (!currentWeekPlan) return [];
    const today = new Date().getDay();
    const dayOfWeek = today === 0 ? 6 : today - 1;
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

  return {
    currentWeekPlan,
    nextWeekPlan,
    loading,
    allRecipes,
    saveNextWeekPlan,
    getRecipeForDay,
    getTodaysRecipe,
    getRemainingMeals,
    hasNextWeekPlan,
    hasCurrentWeekPlan,
    refreshPlans: fetchMealPlans,
    dayNames: DAY_NAMES,
  };
}
