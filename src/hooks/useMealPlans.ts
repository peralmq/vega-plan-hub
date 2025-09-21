import { useState, useEffect } from 'react';

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  image: string;
  cookTime: number;
  servings: number;
  difficulty: "Easy" | "Medium" | "Hard";
  tags: string[];
  theme: string;
  ingredients: string[];
  instructions?: string[];
  nutritionInfo?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  lastUsed?: Date;
}

export interface MealPlan {
  id: string;
  startDate: Date;
  meals: {
    [key: string]: Recipe | null; // Day 1, Day 2, Day 3, etc.
  };
  createdAt: Date;
}

const STORAGE_KEY = 'vegan-meal-plans';
const GRACE_PERIOD_WEEKS = 4; // Don't repeat recipes for 4 weeks

export const useMealPlans = () => {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<Partial<MealPlan>>({
    meals: {
      "Day 1": null,
      "Day 2": null,
      "Day 3": null,
      "Day 4": null,
      "Day 5": null,
      "Day 6": null,
      "Day 7": null,
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
          startDate: new Date(plan.startDate || plan.weekStarting), // Support old format
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
      if (plan.startDate >= cutoffDate) {
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
  const saveCurrentPlan = (startDate: Date = new Date()) => {
    const newPlan: MealPlan = {
      id: Date.now().toString(),
      startDate,
      meals: currentPlan.meals!,
      createdAt: new Date(),
    };
    
    const updatedPlans = [newPlan, ...mealPlans];
    saveMealPlans(updatedPlans);
    
    // Reset current plan
    setCurrentPlan({
      meals: {
        "Day 1": null,
        "Day 2": null,
        "Day 3": null,
        "Day 4": null,
        "Day 5": null,
        "Day 6": null,
        "Day 7": null,
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

  // Find similar recipes based on common ingredients
  const findSimilarRecipes = (recipe: Recipe, allRecipes: Recipe[]): Recipe[] => {
    if (!recipe.ingredients || recipe.ingredients.length === 0) return [];
    
    const recipeIngredients = new Set(recipe.ingredients.map(ing => ing.toLowerCase()));
    
    return allRecipes
      .filter(r => r.id !== recipe.id && r.ingredients && r.ingredients.length > 0)
      .map(r => {
        const commonIngredients = r.ingredients!.filter(ing => 
          recipeIngredients.has(ing.toLowerCase())
        ).length;
        const similarity = commonIngredients / Math.max(recipe.ingredients!.length, r.ingredients!.length);
        return { recipe: r, similarity };
      })
      .filter(({ similarity }) => similarity > 0.3) // At least 30% ingredient overlap
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map(({ recipe }) => recipe);
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
    findSimilarRecipes,
  };
};