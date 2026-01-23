import { useState, useEffect } from 'react';
import type { ParsedIngredient } from '@/services/recipeLoader';

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
  ingredients: ParsedIngredient[];
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
const GRACE_PERIOD_WEEKS = 3; // Don't repeat recipes for 3 weeks
const PLAN_DAYS = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];

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

  // Get recently used recipes with decay scoring (more recent = higher penalty)
  const getRecipeDecayScores = (): Map<string, number> => {
    const now = new Date();
    const decayScores = new Map<string, number>();
    
    mealPlans.forEach(plan => {
      const daysSincePlan = Math.floor((now.getTime() - plan.startDate.getTime()) / (1000 * 60 * 60 * 24));
      const weeksAgo = daysSincePlan / 7;
      
      // Skip if beyond grace period (3 weeks)
      if (weeksAgo >= GRACE_PERIOD_WEEKS) return;
      
      // Calculate decay: 1.0 for this week, decreasing to 0 at cutoff
      // Recent weeks have higher penalty (closer to 1)
      const decayPenalty = Math.max(0, 1 - (weeksAgo / GRACE_PERIOD_WEEKS));
      
      Object.values(plan.meals).forEach(recipe => {
        if (recipe) {
          const existingScore = decayScores.get(recipe.id) || 0;
          // Accumulate penalties (in case recipe was used multiple times)
          decayScores.set(recipe.id, Math.min(1, existingScore + decayPenalty));
        }
      });
    });
    
    return decayScores;
  };

  // Get recently used recipes (within grace period) - for backward compatibility
  const getRecentlyUsedRecipes = (): Set<string> => {
    const decayScores = getRecipeDecayScores();
    // Return recipes with any penalty as "recently used"
    return new Set(Array.from(decayScores.keys()).filter(id => decayScores.get(id)! > 0));
  };

  // Filter recipes to avoid repetition
  const getAvailableRecipes = (allRecipes: Recipe[]): Recipe[] => {
    const recentlyUsed = getRecentlyUsedRecipes();
    return allRecipes.filter(recipe => !recentlyUsed.has(recipe.id));
  };

  // Calculate ingredient overlap score between two recipes (0-1, higher = more overlap)
  const calculateIngredientOverlap = (recipe1: Recipe, recipe2: Recipe): number => {
    if (!recipe1.ingredients?.length || !recipe2.ingredients?.length) return 0;
    
    // Use ingredient key for matching
    const ingredients1 = new Set(recipe1.ingredients.map(i => (i.key || i.ingredient).toLowerCase().trim()));
    const ingredients2 = new Set(recipe2.ingredients.map(i => (i.key || i.ingredient).toLowerCase().trim()));
    
    let overlap = 0;
    ingredients1.forEach(ing => {
      if (ingredients2.has(ing)) overlap++;
    });
    
    return overlap / Math.max(ingredients1.size, ingredients2.size);
  };

  // Score a recipe for auto-fill selection (lower = better)
  const scoreRecipeForSelection = (
    recipe: Recipe, 
    selectedRecipes: Recipe[],
    decayScores: Map<string, number>
  ): number => {
    // Penalty for recently used (0-100 points)
    const decayPenalty = (decayScores.get(recipe.id) || 0) * 100;
    
    // Bonus for ingredient overlap with already-selected recipes (-10 to 0 per recipe)
    const overlapBonus = selectedRecipes.reduce((bonus, selected) => {
      return bonus - (calculateIngredientOverlap(recipe, selected) * 10);
    }, 0);
    
    // Random factor for variety (0-5 points)
    const randomFactor = Math.random() * 5;
    
    return decayPenalty + overlapBonus + randomFactor;
  };

  // Auto-fill the week with unique recipes, prioritizing ingredient overlap and avoiding recent recipes
  const autoFillWeek = (allRecipes: Recipe[]): { filled: number; recipes: Recipe[] } => {
    const decayScores = getRecipeDecayScores();
    const selectedRecipes: Recipe[] = [];
    const usedIds = new Set<string>();
    
    // Also exclude recipes already in current plan
    Object.values(currentPlan.meals || {}).forEach(recipe => {
      if (recipe) usedIds.add(recipe.id);
    });
    
    // Get available recipes (not recently used and not already in plan)
    const candidates = allRecipes.filter(r => !usedIds.has(r.id));
    
    // Fill each empty day
    PLAN_DAYS.forEach(day => {
      if (currentPlan.meals?.[day]) return; // Skip if already filled
      
      // Score all remaining candidates
      const scoredCandidates = candidates
        .filter(r => !usedIds.has(r.id))
        .map(recipe => ({
          recipe,
          score: scoreRecipeForSelection(recipe, selectedRecipes, decayScores)
        }))
        .sort((a, b) => a.score - b.score);
      
      if (scoredCandidates.length > 0) {
        const selected = scoredCandidates[0].recipe;
        addRecipeToDay(day, selected);
        selectedRecipes.push(selected);
        usedIds.add(selected.id);
      }
    });
    
    return { filled: selectedRecipes.length, recipes: selectedRecipes };
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
    
    const recipeIngredients = new Set(recipe.ingredients.map(ing => (ing.key || ing.ingredient).toLowerCase()));
    
    return allRecipes
      .filter(r => r.id !== recipe.id && r.ingredients && r.ingredients.length > 0)
      .map(r => {
        const commonIngredients = r.ingredients!.filter(ing => 
          recipeIngredients.has((ing.key || ing.ingredient).toLowerCase())
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
    autoFillWeek,
    getRecipeDecayScores,
  };
};