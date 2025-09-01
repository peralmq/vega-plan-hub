import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Check, Copy } from "lucide-react";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

// Mock ingredients data - in real app this would come from recipe database
const recipeIngredients: { [key: string]: string[] } = {
  "1": ["Pasta (500g)", "Cherry tomatoes (300g)", "Olives (150g)", "Olive oil", "Garlic (3 cloves)", "Fresh basil"],
  "2": ["Arborio rice (300g)", "Mushrooms (400g)", "Vegetable broth (1L)", "Nutritional yeast", "White wine (250ml)", "Onion (1 large)"],
  "3": ["Coconut milk (400ml)", "Thai green curry paste", "Vegetables mix (500g)", "Jasmine rice (200g)", "Lime (2 pieces)", "Thai basil"],
  "4": ["Bell peppers (3 pieces)", "Broccoli (300g)", "Carrots (200g)", "Soy sauce", "Ginger (30g)", "Garlic (2 cloves)", "Sesame oil"],
};

export const ShoppingListGenerator = () => {
  const { mealPlans } = useMealPlans();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const generateShoppingList = (planId: string) => {
    const plan = mealPlans.find(p => p.id === planId);
    if (!plan) return [];

    const allIngredients = new Set<string>();
    Object.values(plan.meals).forEach(recipe => {
      if (recipe && recipeIngredients[recipe.id]) {
        recipeIngredients[recipe.id].forEach(ingredient => {
          allIngredients.add(ingredient);
        });
      }
    });

    return Array.from(allIngredients).sort();
  };

  const toggleIngredient = (ingredient: string) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(ingredient)) {
      newChecked.delete(ingredient);
    } else {
      newChecked.add(ingredient);
    }
    setCheckedItems(newChecked);
  };

  const copyToClipboard = (ingredients: string[]) => {
    const text = ingredients.join('\n');
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied! 📋",
      description: "Shopping list copied to clipboard!",
    });
  };

  const selectedPlanData = selectedPlan ? mealPlans.find(p => p.id === selectedPlan) : null;
  const shoppingList = selectedPlan ? generateShoppingList(selectedPlan) : [];

  if (mealPlans.length === 0) {
    return (
      <section className="py-20">
        <div className="container">
          <div className="max-w-md mx-auto text-center">
            <div className="text-8xl mb-6">🛒</div>
            <h3 className="text-2xl font-bold mb-4">No Meal Plans Yet!</h3>
            <p className="text-lg text-muted-foreground mb-6">
              Create your first meal plan to generate shopping lists automatically 🌟
            </p>
            <Link to="/meal-planner">
              <Button size="lg" className="bg-gradient-fun shadow-playful">
                Create Meal Plan
              </Button>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20">
      <div className="container">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Meal Plan Selection */}
          <div className="space-y-6">
            <Card className="p-6 shadow-playful border-2 border-dashed border-primary/20">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                Select Meal Plan 📅
              </h3>
              
              <div className="space-y-3">
                {mealPlans.map((plan) => {
                  const mealCount = Object.values(plan.meals).filter(Boolean).length;
                  const isSelected = selectedPlan === plan.id;
                  
                  return (
                    <Card 
                      key={plan.id}
                      className={`p-4 cursor-pointer transition-all duration-200 border-2 border-dashed ${
                        isSelected 
                          ? "border-primary bg-primary/5 shadow-playful" 
                          : "border-border/50 hover:border-primary/30"
                      }`}
                      onClick={() => {
                        setSelectedPlan(isSelected ? null : plan.id);
                        setCheckedItems(new Set());
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">
                            Week of {plan.weekStarting.toLocaleDateString()}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {mealCount} dinners planned
                          </p>
                        </div>
                        <Badge 
                          variant={isSelected ? "default" : "secondary"}
                          className={isSelected ? "bg-gradient-fun text-primary-foreground" : ""}
                        >
                          {isSelected ? "Selected ✓" : "Select"}
                        </Badge>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Shopping List */}
          <div className="space-y-6">
            {selectedPlanData ? (
              <Card className="p-6 shadow-playful border-2 border-dashed border-primary/20">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    🛒 Shopping List
                  </h3>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="bg-gradient-warm text-primary-foreground">
                      {shoppingList.length} items
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(shoppingList)}
                      className="rounded-xl border-2 border-dashed hover:border-primary/50"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="mb-4 p-3 bg-gradient-fresh/10 rounded-xl border border-primary/20">
                  <p className="text-sm font-medium">
                    Week of {selectedPlanData.weekStarting.toLocaleDateString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Object.values(selectedPlanData.meals).filter(Boolean).length} recipes • Shopping list auto-generated
                  </p>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {shoppingList.map((ingredient, index) => {
                    const isChecked = checkedItems.has(ingredient);
                    
                    return (
                      <div
                        key={index}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                          isChecked 
                            ? "border-primary bg-primary/5 opacity-60" 
                            : "border-border/30 hover:border-primary/30"
                        }`}
                        onClick={() => toggleIngredient(ingredient)}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isChecked 
                            ? "border-primary bg-primary" 
                            : "border-border"
                        }`}>
                          {isChecked && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <span className={`flex-1 ${isChecked ? "line-through text-muted-foreground" : ""}`}>
                          {ingredient}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {checkedItems.size > 0 && (
                  <div className="mt-4 p-3 bg-gradient-fun/10 rounded-xl border border-primary/20 text-center">
                    <p className="text-sm font-medium">
                      🎉 {checkedItems.size} of {shoppingList.length} items checked off!
                    </p>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="p-12 shadow-playful border-2 border-dashed border-primary/20 text-center">
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-xl font-bold mb-2">Select a Meal Plan</h3>
                <p className="text-muted-foreground">
                  Choose a meal plan from the left to generate its shopping list automatically!
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};