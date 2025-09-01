import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Copy, Trash2 } from "lucide-react";
import { useMealPlans, MealPlan } from "@/hooks/useMealPlans";
import { formatDistanceToNow } from "date-fns";

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const MealPlanHistory = () => {
  const { mealPlans, loadPlan, deletePlan } = useMealPlans();

  if (mealPlans.length === 0) {
    return (
      <section className="py-20 bg-muted/20">
        <div className="container">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">
              Meal Plan <span className="bg-gradient-fun bg-clip-text text-transparent">History</span> 📚
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Your saved meal plans will appear here! Start planning your first week 🌟
            </p>
          </div>
          
          <div className="max-w-md mx-auto text-center">
            <div className="text-8xl mb-6">🥗</div>
            <p className="text-lg text-muted-foreground">
              No meal plans yet! Create your first delicious weekly plan to get started 🚀
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20 bg-muted/20">
      <div className="container">
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">
            Meal Plan <span className="bg-gradient-fun bg-clip-text text-transparent">History</span> 📚
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Browse your previous meal plans and reuse favorites! 🔄
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mealPlans.map((plan) => {
            const mealCount = Object.values(plan.meals).filter(Boolean).length;
            const totalCookTime = Object.values(plan.meals)
              .filter(Boolean)
              .reduce((sum, recipe) => sum + (recipe?.cookTime || 0), 0);

            return (
              <Card key={plan.id} className="p-6 shadow-playful border-2 border-dashed border-primary/20 hover:shadow-glow transition-all duration-300">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-sm">
                        Week of {plan.weekStarting.toLocaleDateString()}
                      </span>
                    </div>
                    <Badge variant="secondary" className="bg-gradient-warm text-primary-foreground">
                      {mealCount}/7 meals
                    </Badge>
                  </div>

                  {/* Quick Stats */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {totalCookTime}min total
                    </div>
                    <div>
                      📅 {formatDistanceToNow(plan.createdAt)} ago
                    </div>
                  </div>

                  {/* Mini Calendar View */}
                  <div className="grid grid-cols-7 gap-1">
                    {weekDays.map((day) => {
                      const meal = plan.meals[day];
                      return (
                        <div key={day} className="text-center">
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            {day}
                          </div>
                          <div className={`h-8 rounded-lg flex items-center justify-center text-xs ${
                            meal 
                              ? "bg-gradient-fun text-primary-foreground shadow-sm" 
                              : "bg-muted border border-dashed border-border"
                          }`}>
                            {meal ? "🍽️" : "➕"}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Meal Preview */}
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">This Week's Dinners:</h4>
                    <div className="space-y-1 max-h-20 overflow-y-auto">
                      {Object.entries(plan.meals)
                        .filter(([_, recipe]) => recipe)
                        .map(([day, recipe]) => (
                          <div key={day} className="text-xs text-muted-foreground truncate">
                            <span className="font-medium">{day}:</span> {recipe?.title}
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadPlan(plan.id)}
                      className="flex-1 rounded-xl border-2 border-dashed hover:border-primary/50"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Reuse Plan
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deletePlan(plan.id)}
                      className="text-destructive hover:text-destructive rounded-xl border-2 border-dashed hover:border-destructive/50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};