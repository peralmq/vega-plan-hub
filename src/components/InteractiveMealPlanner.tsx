import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Save, RotateCcw, Sparkles } from "lucide-react";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useState, useMemo } from "react";
import { toast } from "@/hooks/use-toast";
import { loadAllRecipes } from "@/services/recipeLoader";

const planDays = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];

export const InteractiveMealPlanner = () => {
  const { 
    currentPlan, 
    addRecipeToDay, 
    removeRecipeFromDay, 
    saveCurrentPlan, 
    getAvailableRecipes,
    getPlanStats,
    autoFillWeek,
  } = useMealPlans();
  
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Load recipes from markdown files
  const availableRecipes = useMemo(() => loadAllRecipes(), []);

  const availableToday = getAvailableRecipes(availableRecipes);
  const stats = getPlanStats();

  const handleAutoFill = () => {
    const result = autoFillWeek(availableRecipes);
    if (result.filled === 0) {
      toast({
        title: "No recipes available 😅",
        description: "All recipes were recently used. Try again next week!",
        variant: "destructive",
      });
    } else if (result.filled < 7) {
      toast({
        title: `Filled ${result.filled} days! 🎲`,
        description: `Only ${result.filled} unique recipes available. Add more recipes to fill the week!`,
      });
    } else {
      toast({
        title: "Week auto-filled! 🎉",
        description: "7 unique dinners selected based on variety and ingredient overlap!",
      });
    }
  };

  const handleSavePlan = () => {
    if (stats.totalMeals === 0) {
      toast({
        title: "Oops! 🤭",
        description: "Add at least one dinner to save your meal plan!",
        variant: "destructive",
      });
      return;
    }

    saveCurrentPlan();
    toast({
      title: "Meal Plan Saved! 🎉",
      description: `Your week is planned with ${stats.totalMeals} delicious dinners!`,
    });
  };

  const handleAddRecipe = (day: string, recipe: any) => {
    addRecipeToDay(day, recipe);
    setSelectedDay(null);
    toast({
      title: "Recipe Added! ✨", 
      description: `${recipe.title} added to ${day}!`,
    });
  };

  return (
    <section className="py-20">
      <div className="container">
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">
            Interactive <span className="bg-gradient-fun bg-clip-text text-transparent">Meal Planner</span> 🎯
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Click the + buttons to add dinners to your weekly plan! 🎯
          </p>
        </div>

        <Card className="p-6 shadow-playful border-2 border-dashed border-primary/20">
          {/* Header with Stats */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">This Week's Dinner Plan 🌟</h3>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="bg-gradient-warm text-primary-foreground">
                {stats.totalMeals}/7 dinners planned
              </Badge>
              <Badge variant="outline" className="border-dashed">
                ⏱️ {stats.totalCookTime}min total
              </Badge>
            </div>
          </div>

          {/* Plan Grid */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-6">
            {planDays.map((day) => {
              const dayPlan = currentPlan.meals?.[day];
              
              return (
                <Card key={day} className="p-4 border-2 border-dashed border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-playful">
                  <h4 className="font-bold text-center mb-4 text-sm text-primary">{day}</h4>
                  
                  {/* Dinner Slot */}
                  <div className="min-h-[100px] flex items-center justify-center">
                    {dayPlan ? (
                      <div className="bg-gradient-fun text-primary-foreground text-xs rounded-xl p-3 text-center w-full shadow-glow relative group">
                        <div className="font-bold">🍽️ Dinner</div>
                        <div className="truncate text-white/90 mt-1">{dayPlan.title}</div>
                        <div className="text-white/70 text-[10px] mt-1">{dayPlan.cookTime}min</div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRecipeFromDay(day)}
                          className="absolute -top-2 -right-2 h-6 w-6 p-0 bg-destructive hover:bg-destructive/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                        className="w-full h-full border-2 border-dashed border-border/30 hover:border-primary/50 flex-col gap-1 rounded-xl"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="text-xs">Add Dinner 🍽️</span>
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Recipe Selection */}
          {selectedDay && (
            <Card className="p-4 mb-6 bg-muted/30 border-2 border-dashed border-primary/20">
              <h4 className="font-semibold mb-3">
                Choose dinner for <span className="text-primary">{selectedDay}</span> 🍽️
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {availableToday.slice(0, 8).map((recipe) => (
                  <Card 
                    key={recipe.id}
                    className="p-3 cursor-pointer hover:shadow-playful transition-all duration-200 hover:scale-105 border-2 border-dashed hover:border-primary/50"
                    onClick={() => handleAddRecipe(selectedDay, recipe)}
                  >
                    <img 
                      src={recipe.image} 
                      alt={recipe.title}
                      className="w-full h-20 object-cover rounded-lg mb-2"
                    />
                    <h5 className="font-medium text-sm mb-1 truncate">{recipe.title}</h5>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>⏱️ {recipe.cookTime}min</span>
                      <span>🍽️ {recipe.servings} portions</span>
                    </div>
                  </Card>
                ))}
              </div>
              {availableToday.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  All recipes have been recently used! Add more recipes to the database 📚
                </p>
              )}
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => {
                planDays.forEach(day => removeRecipeFromDay(day));
                toast({ title: "Plan cleared! 🧹", description: "Ready to start fresh!" });
              }}
              className="rounded-xl border-2 border-dashed hover:border-destructive/50"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear Plan
            </Button>
            <Button 
              variant="outline"
              onClick={handleAutoFill}
              className="rounded-xl border-2 border-dashed hover:border-primary/50 bg-gradient-to-r from-primary/5 to-accent/5"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Auto-Fill Week ✨
            </Button>
            <Button 
              size="lg" 
              onClick={handleSavePlan}
              className="bg-gradient-fun shadow-playful hover:shadow-glow transition-all duration-300 hover:scale-105"
            >
              <Save className="h-4 w-4 mr-2" />
              🌟 Save This Plan 🌟
            </Button>
          </div>

          {/* Help Text */}
          {stats.totalMeals > 0 && (
            <div className="text-center mt-6 p-4 bg-gradient-fresh/10 rounded-xl border border-primary/20">
            <p className="text-sm text-muted-foreground">
              🎉 Great job! You have <strong>{stats.totalMeals} dinners</strong> planned for this week!
            </p>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
};