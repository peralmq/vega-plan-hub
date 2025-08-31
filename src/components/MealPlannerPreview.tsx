import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar } from "lucide-react";

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const mockMealPlan = {
  Mon: { breakfast: "Overnight Oats", lunch: "Buddha Bowl", dinner: "Pasta Primavera" },
  Tue: { breakfast: "Smoothie Bowl", lunch: "Quinoa Salad", dinner: "Mushroom Risotto" },
  Wed: { breakfast: "Avocado Toast", lunch: "Lentil Soup", dinner: "Thai Curry" },
  Thu: { breakfast: null, lunch: "Veggie Wrap", dinner: null },
  Fri: { breakfast: "Chia Pudding", lunch: null, dinner: "Stir-fry" },
  Sat: { breakfast: null, lunch: null, dinner: null },
  Sun: { breakfast: null, lunch: null, dinner: null }
};

export const MealPlannerPreview = () => {
  return (
    <section className="py-20">
      <div className="container">
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">
            Weekly <span className="bg-gradient-primary bg-clip-text text-transparent">Meal Planner</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Plan your week ahead with our intuitive drag-and-drop meal planner
          </p>
        </div>

        <Card className="p-6 shadow-fresh">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">This Week's Plan</h3>
            </div>
            <Badge variant="secondary">4/21 meals planned</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            {weekDays.map((day) => (
              <Card key={day} className="p-4 border-2 border-dashed border-border/50 hover:border-primary/30 transition-colors">
                <h4 className="font-medium text-center mb-4 text-sm">{day}</h4>
                <div className="space-y-3">
                  {["breakfast", "lunch", "dinner"].map((meal) => {
                    const mealName = mockMealPlan[day as keyof typeof mockMealPlan]?.[meal as keyof typeof mockMealPlan.Mon];
                    
                    return (
                      <div key={meal} className="min-h-[60px] flex items-center justify-center">
                        {mealName ? (
                          <div className="bg-gradient-fresh text-primary-foreground text-xs rounded-lg p-2 text-center w-full">
                            <div className="font-medium capitalize">{meal}</div>
                            <div className="truncate">{mealName}</div>
                          </div>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full h-full border-2 border-dashed border-border/30 hover:border-primary/50 flex-col gap-1"
                          >
                            <Plus className="h-4 w-4" />
                            <span className="text-xs capitalize">{meal}</span>
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>

          <div className="flex justify-center mt-8">
            <Button size="lg" className="bg-gradient-primary">
              Create My Meal Plan
            </Button>
          </div>
        </Card>
      </div>
    </section>
  );
};