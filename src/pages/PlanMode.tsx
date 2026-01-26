import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Calendar, 
  ChefHat, 
  LogOut, 
  Plus, 
  X, 
  RotateCcw, 
  Sparkles, 
  ArrowRight,
  Clock,
  Users,
  AlertCircle
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMealPlanDB } from "@/hooks/useMealPlanDB";
import { ParsedRecipe, loadAllRecipes } from "@/services/recipeLoader";
import { toast } from "@/hooks/use-toast";
import { addWeeks, startOfWeek, format } from "date-fns";

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function PlanMode() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { 
    hasNextWeekPlan, 
    saveNextWeekPlan, 
    saveCurrentWeekPlan,
    loading, 
    nextWeekPlan,
    currentWeekPlan,
    getTodayIndex,
    getCurrentMonday,
    getNextMonday,
  } = useMealPlanDB();
  
  const allRecipes = useMemo(() => loadAllRecipes(), []);
  
  // Check if we're planning for current week (from navigation state)
  const planCurrentWeek = location.state?.planCurrentWeek === true;
  const todayIndex = getTodayIndex();
  
  // Which week are we planning for?
  const targetMonday = planCurrentWeek ? getCurrentMonday() : getNextMonday();
  const weekLabel = `Week of ${format(targetMonday, 'MMM d')}`;
  const isCurrentWeek = planCurrentWeek;
  
  // For current week, only allow planning from today onwards
  const minDayIndex = isCurrentWeek ? todayIndex : 0;
  
  // Initialize planned meals from existing plan
  const [plannedMeals, setPlannedMeals] = useState<Map<number, ParsedRecipe>>(() => new Map());
  const [selectingForDay, setSelectingForDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Update planned meals when plan data loads
  useEffect(() => {
    const sourcePlan = isCurrentWeek ? currentWeekPlan : nextWeekPlan;
    if (sourcePlan) {
      const initial = new Map<number, ParsedRecipe>();
      sourcePlan.meals.forEach(meal => {
        if (meal.recipe) {
          initial.set(meal.dayOfWeek, meal.recipe);
        }
      });
      setPlannedMeals(initial);
    }
  }, [isCurrentWeek, currentWeekPlan, nextWeekPlan]);

  // Stats - only count days from minDayIndex onwards for current week
  const planableDays = 7 - minDayIndex;
  const totalMeals = Array.from(plannedMeals.entries()).filter(([day]) => day >= minDayIndex).length;
  const totalCookTime = Array.from(plannedMeals.entries())
    .filter(([day]) => day >= minDayIndex)
    .reduce((sum, [, r]) => sum + r.cookTime, 0);

  // Get used recipe IDs
  const usedRecipeIds = new Set(Array.from(plannedMeals.values()).map(r => r.id));

  // Auto-fill remaining days
  const handleAutoFill = () => {
    const available = allRecipes.filter(r => !usedRecipeIds.has(r.id));
    const newMeals = new Map(plannedMeals);
    
    let filled = 0;
    for (let day = minDayIndex; day < 7; day++) {
      if (!newMeals.has(day) && available.length > 0) {
        // Pick a random recipe
        const randomIndex = Math.floor(Math.random() * available.length);
        const recipe = available.splice(randomIndex, 1)[0];
        newMeals.set(day, recipe);
        filled++;
      }
    }

    setPlannedMeals(newMeals);
    
    if (filled > 0) {
      toast({
        title: `Filled ${filled} days! 🎲`,
        description: "Unique recipes selected for variety.",
      });
    } else {
      toast({
        title: "Already full! 🎉",
        description: `All ${planableDays} days are planned.`,
      });
    }
  };

  // Clear all (only clearable days)
  const handleClear = () => {
    const newMeals = new Map(plannedMeals);
    for (let day = minDayIndex; day < 7; day++) {
      newMeals.delete(day);
    }
    setPlannedMeals(newMeals);
    toast({
      title: "Plan cleared! 🧹",
      description: "Ready to start fresh.",
    });
  };

  // Add recipe to day
  const handleSelectRecipe = (recipe: ParsedRecipe) => {
    if (selectingForDay === null) return;
    
    setPlannedMeals(prev => {
      const newMeals = new Map(prev);
      newMeals.set(selectingForDay, recipe);
      return newMeals;
    });
    
    setSelectingForDay(null);
    toast({
      title: "Added! ✨",
      description: `${recipe.title} on ${DAY_NAMES[selectingForDay]}.`,
    });
  };

  // Remove recipe from day
  const handleRemove = (day: number) => {
    setPlannedMeals(prev => {
      const newMeals = new Map(prev);
      newMeals.delete(day);
      return newMeals;
    });
  };

  // Swap two days
  const handleSwap = (day1: number, day2: number) => {
    setPlannedMeals(prev => {
      const newMeals = new Map(prev);
      const recipe1 = prev.get(day1);
      const recipe2 = prev.get(day2);
      
      if (recipe1 && recipe2) {
        newMeals.set(day1, recipe2);
        newMeals.set(day2, recipe1);
      } else if (recipe1) {
        newMeals.delete(day1);
        newMeals.set(day2, recipe1);
      } else if (recipe2) {
        newMeals.set(day1, recipe2);
        newMeals.delete(day2);
      }
      
      return newMeals;
    });
  };

  // Save plan
  const handleSave = async () => {
    if (totalMeals === 0) {
      toast({
        title: "Add some meals first! 😅",
        description: "Select at least one dinner before saving.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const mealsMap = new Map<number, string>();
      plannedMeals.forEach((recipe, day) => {
        // Only include days from minDayIndex onwards for current week
        if (day >= minDayIndex) {
          mealsMap.set(day, recipe.id);
        }
      });
      
      if (isCurrentWeek) {
        await saveCurrentWeekPlan(mealsMap);
      } else {
        await saveNextWeekPlan(mealsMap);
      }
      
      navigate('/summary', { 
        state: { 
          meals: Array.from(plannedMeals.entries()).filter(([day]) => day >= minDayIndex),
          isCurrentWeek 
        } 
      });
    } catch (error) {
      console.error('Error saving plan:', error);
      toast({
        title: "Error saving plan",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background shadow-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="h-6 w-6 text-primary" />
              <div>
                <span className="text-lg font-bold">Plan Mode</span>
                <span className="text-sm text-muted-foreground ml-2">{weekLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <ChefHat className="h-4 w-4 mr-2" />
                Cook
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-6">
        {/* Current week notice */}
        {isCurrentWeek && (
          <Card className="p-4 mb-6 bg-primary/5 border-primary/20">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Planning for the rest of this week</p>
                <p className="text-sm text-muted-foreground">
                  Days before today ({DAY_NAMES.slice(0, todayIndex).join(', ') || 'none'}) are locked.
                </p>
              </div>
            </div>
          </Card>
        )}
        
        {/* Stats */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-4">
            <Badge variant="secondary" className="bg-gradient-warm text-foreground">
              {totalMeals}/{planableDays} dinners planned
            </Badge>
            <Badge variant="outline">
              ⏱️ {totalCookTime} min total
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClear}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={handleAutoFill}>
              <Sparkles className="h-4 w-4 mr-2" />
              Auto-Fill
            </Button>
          </div>
        </div>

        {/* Week Grid */}
        <div className="grid md:grid-cols-7 gap-4 mb-8">
          {DAY_NAMES.map((day, index) => {
            const recipe = plannedMeals.get(index);
            const isPastDay = isCurrentWeek && index < minDayIndex;
            
            return (
              <Card 
                key={day} 
                className={`p-4 border-2 border-dashed transition-all ${
                  isPastDay ? 'opacity-50 bg-muted/50' : 'hover:border-primary/30'
                }`}
              >
                <h3 className="font-bold text-sm text-primary mb-3 text-center">
                  {day}
                  {isCurrentWeek && index === todayIndex && (
                    <Badge variant="outline" className="ml-1 text-xs">Today</Badge>
                  )}
                </h3>
                
                {isPastDay ? (
                  <div className="h-32 flex items-center justify-center text-muted-foreground text-xs">
                    Past
                  </div>
                ) : recipe ? (
                  <div className="relative group">
                    <div className="bg-gradient-fun text-white rounded-xl overflow-hidden">
                      <img 
                        src={recipe.image} 
                        alt={recipe.title}
                        className="w-full h-20 object-cover opacity-80"
                      />
                      <div className="p-3">
                        <div className="font-bold text-sm truncate">{recipe.title}</div>
                        <div className="text-xs text-white/70 mt-1">
                          ⏱️ {recipe.cookTime}min
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(index)}
                      className="absolute -top-2 -right-2 h-6 w-6 p-0 bg-destructive hover:bg-destructive/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectingForDay(index)}
                    className="w-full h-32 border-2 border-dashed border-border/30 hover:border-primary/50 flex-col gap-2 rounded-xl"
                  >
                    <Plus className="h-6 w-6" />
                    <span className="text-xs">Add Dinner</span>
                  </Button>
                )}
              </Card>
            );
          })}
        </div>

        {/* Aggregated Info */}
        {totalMeals > 0 && (
          <Card className="p-6 mb-8 bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
            <h3 className="font-bold mb-4">Week Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">{totalMeals}</div>
                <div className="text-sm text-muted-foreground">Meals</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{totalCookTime}</div>
                <div className="text-sm text-muted-foreground">Total Minutes</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {new Set(Array.from(plannedMeals.values()).flatMap(r => r.tags)).size}
                </div>
                <div className="text-sm text-muted-foreground">Cuisines</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {Array.from(plannedMeals.values()).reduce((sum, r) => sum + r.ingredients.length, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Ingredients</div>
              </div>
            </div>
          </Card>
        )}

        {/* Save Button */}
        <div className="text-center">
          <Button 
            size="lg" 
            onClick={handleSave}
            disabled={saving || totalMeals === 0}
            className="bg-gradient-fun text-white rounded-xl shadow-playful hover:shadow-glow transition-all px-8"
          >
            {saving ? (
              <>Saving...</>
            ) : (
              <>
                Save & Get Shopping List
                <ArrowRight className="h-5 w-5 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Recipe Selection Modal */}
      <Dialog open={selectingForDay !== null} onOpenChange={() => setSelectingForDay(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Select dinner for {selectingForDay !== null ? DAY_NAMES[selectingForDay] : ''}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {allRecipes
              .filter(r => !usedRecipeIds.has(r.id))
              .map(recipe => (
                <Card 
                  key={recipe.id}
                  className="p-3 cursor-pointer hover:shadow-playful transition-all hover:scale-[1.02] border-2 border-dashed hover:border-primary/50"
                  onClick={() => handleSelectRecipe(recipe)}
                >
                  <img 
                    src={recipe.image} 
                    alt={recipe.title}
                    className="w-full h-24 object-cover rounded-lg mb-2"
                  />
                  <h4 className="font-bold text-sm truncate">{recipe.title}</h4>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {recipe.cookTime}min
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {recipe.servings}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {recipe.tags.slice(0, 2).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs px-2 py-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </Card>
              ))}
          </div>

          {allRecipes.filter(r => !usedRecipeIds.has(r.id)).length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              All recipes are already in your plan! 🎉
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
