import { useState, useEffect } from 'react';

export interface Recipe {
  id: string;
  title: string;
  image: string;
  cookTime: number;
  servings: number;
  difficulty: "Easy" | "Medium" | "Hard";
  tags: string[];
  theme: string;
  lastUsed?: Date;
}

export interface MealPlan {
  id: string;
  weekStarting: Date;
  meals: {
    [key: string]: Recipe | null; // Mon, Tue, Wed, etc.
  };
  createdAt: Date;
}

const STORAGE_KEY = 'vegan-meal-plans';
const GRACE_PERIOD_WEEKS = 4; // Don't repeat recipes for 4 weeks

export const useMealPlans = () => {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<Partial<MealPlan>>({
    meals: {
      Mon: null,
      Tue: null,
      Wed: null,
      Thu: null,
      Fri: null,
      Sat: null,
      Sun: null,
    }
  });

  // Load meal plans from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const plansWithDates = parsed.map((plan: any) => ({
          ...plan,
          weekStarting: new Date(plan.weekStarting),
          createdAt: new Date(plan.createdAt),
        }));
        setMealPlans(plansWithDates);
      } catch (error) {
        console.error('Failed to load meal plans:', error);
      }
    }
  }, []);

  // Save meal plans to localStorage
  const saveMealPlans = (plans: MealPlan[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
    setMealPlans(plans);
  };

  // Get recently used recipes (within grace period)
  const getRecentlyUsedRecipes = (): Set<string> => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (GRACE_PERIOD_WEEKS * 7));
    
    const recentRecipeIds = new Set<string>();
    
    mealPlans.forEach(plan => {
      if (plan.weekStarting >= cutoffDate) {
        Object.values(plan.meals).forEach(recipe => {
          if (recipe) {
            recentRecipeIds.add(recipe.id);
          }
        });
      }
    });
    
    return recentRecipeIds;
  };

  // Filter recipes to avoid repetition
  const getAvailableRecipes = (allRecipes: Recipe[]): Recipe[] => {
    const recentlyUsed = getRecentlyUsedRecipes();
    return allRecipes.filter(recipe => !recentlyUsed.has(recipe.id));
  };

  // Add recipe to current plan
  const addRecipeToDay = (day: string, recipe: Recipe) => {
    setCurrentPlan(prev => ({
      ...prev,
      meals: {
        ...prev.meals,
        [day]: recipe
      }
    }));
  };

  // Remove recipe from current plan
  const removeRecipeFromDay = (day: string) => {
    setCurrentPlan(prev => ({
      ...prev,
      meals: {
        ...prev.meals,
        [day]: null
      }
    }));
  };

  // Save current plan
  const saveCurrentPlan = (weekStarting: Date = new Date()) => {
    const newPlan: MealPlan = {
      id: Date.now().toString(),
      weekStarting,
      meals: currentPlan.meals!,
      createdAt: new Date(),
    };
    
    const updatedPlans = [newPlan, ...mealPlans];
    saveMealPlans(updatedPlans);
    
    // Reset current plan
    setCurrentPlan({
      meals: {
        Mon: null,
        Tue: null,
        Wed: null,
        Thu: null,
        Fri: null,
        Sat: null,
        Sun: null,
      }
    });

    return newPlan;
  };

  // Load a previous plan as current
  const loadPlan = (planId: string) => {
    const plan = mealPlans.find(p => p.id === planId);
    if (plan) {
      setCurrentPlan({
        meals: { ...plan.meals }
      });
    }
  };

  // Delete a meal plan
  const deletePlan = (planId: string) => {
    const updatedPlans = mealPlans.filter(p => p.id !== planId);
    saveMealPlans(updatedPlans);
  };

  // Get plan statistics
  const getPlanStats = () => {
    const totalMeals = Object.values(currentPlan.meals || {}).filter(Boolean).length;
    const totalCookTime = Object.values(currentPlan.meals || {})
      .filter(Boolean)
      .reduce((sum, recipe) => sum + (recipe?.cookTime || 0), 0);
    
    return {
      totalMeals,
      totalCookTime,
      hasLeftovers: totalMeals, // Each dinner provides leftovers for next day's lunch
    };
  };

  return {
    mealPlans,
    currentPlan,
    addRecipeToDay,
    removeRecipeFromDay,
    saveCurrentPlan,
    loadPlan,
    deletePlan,
    getAvailableRecipes,
    getRecentlyUsedRecipes,
    getPlanStats,
  };
};