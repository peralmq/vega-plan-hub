import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar } from "lucide-react";

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const mockMealPlan = {
  Mon: { dinner: "Mediterranean Pasta (45min)", hasLeftovers: true },
  Tue: { dinner: "Mushroom Risotto (35min)", hasLeftovers: true },
  Wed: { dinner: "Thai Green Curry (30min)", hasLeftovers: true },
  Thu: { dinner: null, hasLeftovers: false },
  Fri: { dinner: "Rainbow Stir-fry (15min)", hasLeftovers: true },
  Sat: { dinner: null, hasLeftovers: false },
  Sun: { dinner: null, hasLeftovers: false }
};

export const MealPlannerPreview = () => {
  return (
    <section className="py-20">
      <div className="container">
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">
            Weekly <span className="bg-gradient-fun bg-clip-text text-transparent">Dinner Planner</span> 🍽️
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Cook dinner, enjoy leftovers for lunch! Plan delicious plant-based dinners under 60 minutes ⏰
          </p>
        </div>

        <Card className="p-6 shadow-playful border-2 border-dashed border-primary/20">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">This Week's Dinner Plan 🌟</h3>
            </div>
            <Badge variant="secondary" className="bg-gradient-warm text-primary-foreground">3/7 dinners planned</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            {weekDays.map((day) => {
              const dayPlan = mockMealPlan[day as keyof typeof mockMealPlan];
              
              return (
                <Card key={day} className="p-4 border-2 border-dashed border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-playful">
                  <h4 className="font-bold text-center mb-4 text-sm text-primary">{day}</h4>
                  
                  {/* Dinner Slot */}
                  <div className="min-h-[80px] flex items-center justify-center mb-3">
                    {dayPlan?.dinner ? (
                      <div className="bg-gradient-fun text-primary-foreground text-xs rounded-xl p-3 text-center w-full shadow-glow">
                        <div className="font-bold">🍽️ Dinner</div>
                        <div className="truncate text-white/90 mt-1">{dayPlan.dinner}</div>
                      </div>
                    ) : (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full h-full border-2 border-dashed border-border/30 hover:border-primary/50 flex-col gap-1 rounded-xl"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="text-xs">Add Dinner 🍽️</span>
                      </Button>
                    )}
                  </div>
                  
                  {/* Lunch Preview */}
                  <div className="min-h-[60px] flex items-center justify-center">
                    {dayPlan?.hasLeftovers ? (
                      <div className="bg-gradient-warm text-primary-foreground text-xs rounded-lg p-2 text-center w-full opacity-75">
                        <div className="font-medium">🥡 Tomorrow's Lunch</div>
                        <div className="text-white/80">Leftovers!</div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground text-center py-2">
                        No leftovers planned
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex justify-center mt-8">
            <Button size="lg" className="bg-gradient-fun shadow-playful hover:shadow-glow transition-all duration-300 hover:scale-105">
              🌟 Create My Weekly Plan 🌟
            </Button>
          </div>
        </Card>
      </div>
    </section>
  );
};