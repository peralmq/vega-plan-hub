import { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ShoppingCart, 
  ChefHat, 
  Printer, 
  Copy, 
  Check,
  Calendar,
  ArrowLeft
} from "lucide-react";
import { useMealPlanDB } from "@/hooks/useMealPlanDB";
import { ParsedRecipe } from "@/services/recipeLoader";
import { aggregateIngredients, formatAggregatedIngredient, AggregatedIngredient } from "@/lib/ingredientNormalization";
import { scaleIngredients } from "@/lib/ingredientScaling";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { format } from "date-fns";

export default function ShoppingSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { nextWeekPlan, currentWeekPlan, loading, getCurrentMonday, getNextMonday } = useMealPlanDB();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Check if we came from current week planning
  const isCurrentWeek = location.state?.isCurrentWeek === true;
  const targetPlan = isCurrentWeek ? currentWeekPlan : nextWeekPlan;
  const targetMonday = isCurrentWeek ? getCurrentMonday() : getNextMonday();
  const weekLabel = `Week of ${format(targetMonday, 'MMM d')}`;

  // Get recipes from the saved plan with their multipliers
  const mealsWithMultipliers = useMemo(() => {
    if (!targetPlan) return [];
    return targetPlan.meals
      .filter(m => m.recipe)
      .map(m => ({
        recipe: m.recipe as ParsedRecipe,
        servingsMultiplier: m.servingsMultiplier ?? 1.0,
      }));
  }, [targetPlan]);

  // For display: unique recipes
  const recipes = mealsWithMultipliers.map(m => m.recipe);

  // Aggregate ingredients across all recipes with scaling for multipliers
  const aggregatedIngredients = useMemo(() => {
    const allIngredients: Array<{ ingredient: any; recipeName: string }> = [];
    
    mealsWithMultipliers.forEach(({ recipe, servingsMultiplier }) => {
      if (!recipe.ingredients) return;
      
      // Scale ingredients based on multiplier
      const targetServings = Math.round(recipe.servings * servingsMultiplier);
      const scaledIngredients = scaleIngredients(recipe.ingredients, recipe.servings, targetServings);
      
      scaledIngredients.forEach(ing => {
        allIngredients.push({ ingredient: ing, recipeName: recipe.title });
      });
    });
    
    return aggregateIngredients(allIngredients);
  }, [mealsWithMultipliers]);

  const toggleItem = (key: string) => {
    setCheckedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const handleCopyToClipboard = () => {
    const text = aggregatedIngredients
      .map(ing => {
        const qty = ing.quantity ? `${ing.quantity} ` : '';
        const unit = ing.unit ? `${ing.unit} ` : '';
        return `- ${qty}${unit}${ing.displayName}`;
      })
      .join('\n');

    navigator.clipboard.writeText(`Shopping List for ${weekLabel}\n\n${text}`);
    toast({
      title: "Copied! 📋",
      description: "Shopping list copied to clipboard.",
    });
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!targetPlan || recipes.length === 0) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header />
        <div className="container py-20">
          <Card className="max-w-xl mx-auto p-8 text-center">
            <ShoppingCart className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
            <h2 className="text-2xl font-bold mb-4">No meal plan saved</h2>
            <p className="text-muted-foreground mb-6">
              Plan your meals first to generate a shopping list.
            </p>
            <Button onClick={() => navigate('/plan')} className="bg-gradient-fun text-white">
              Plan Next Week
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const uncheckedCount = aggregatedIngredients.length - checkedItems.size;

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      <div className="container py-6 print:py-2">
        {/* Success Message */}
        <Card className="p-6 mb-6 bg-gradient-fun text-white text-center print:hidden">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Check className="h-6 w-6" />
            <h2 className="text-xl font-bold">Meal Plan Saved!</h2>
          </div>
          <p>Your {weekLabel} plan is ready. Here's your shopping list.</p>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Shopping List */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6 print:mb-4">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="h-6 w-6 text-primary" />
                  <h2 className="text-xl font-bold">Shopping List</h2>
                  <Badge variant="secondary">
                    {uncheckedCount} items left
                  </Badge>
                </div>
                <div className="flex gap-2 print:hidden">
                  <Button variant="outline" size="sm" onClick={handleCopyToClipboard}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {aggregatedIngredients.map(ing => (
                  <div 
                    key={ing.key}
                    className={`flex items-center p-3 rounded-lg border transition-all ${
                      checkedItems.has(ing.key) 
                        ? 'bg-muted/50 border-transparent' 
                        : 'bg-background hover:bg-muted/30'
                    }`}
                  >
                    <Checkbox
                      id={ing.key}
                      checked={checkedItems.has(ing.key)}
                      onCheckedChange={() => toggleItem(ing.key)}
                      className="mr-4 print:hidden"
                    />
                    <label 
                      htmlFor={ing.key}
                      className={`flex-1 cursor-pointer ${
                        checkedItems.has(ing.key) ? 'line-through text-muted-foreground' : ''
                      }`}
                    >
                      <span className="font-medium">
                        {formatAggregatedIngredient(ing)}
                      </span>
                      {ing.recipes.length > 1 && (
                        <span className="text-xs text-muted-foreground ml-2">
                          (×{ing.recipes.length} recipes)
                        </span>
                      )}
                    </label>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Planned Meals Sidebar */}
          <div className="print:hidden">
            <Card className="p-6 sticky top-24">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5 text-primary" />
                <h3 className="font-bold">Planned Meals</h3>
              </div>
              <div className="space-y-3">
                {mealsWithMultipliers.map(({ recipe, servingsMultiplier }, index) => (
                  <div key={`${recipe.id}-${index}`} className="flex items-center gap-3">
                    <img 
                      src={recipe.image} 
                      alt={recipe.title}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{recipe.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {recipe.cookTime}min • {Math.round(recipe.servings * servingsMultiplier)} servings
                        {servingsMultiplier !== 1 && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {servingsMultiplier}×
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-4 mt-8 print:hidden">
          <Button variant="outline" onClick={() => navigate('/plan')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Edit Plan
          </Button>
          <Button 
            onClick={() => navigate('/')} 
            className="bg-gradient-fun text-white"
          >
            <ChefHat className="h-4 w-4 mr-2" />
            Start Cooking
          </Button>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
          .print\\:mb-4 { margin-bottom: 1rem; }
        }
      `}</style>
    </div>
  );
}

function Header() {
  const navigate = useNavigate();
  
  return (
    <header className="bg-background shadow-sm sticky top-0 z-10 print:hidden">
      <div className="container py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">Shopping List</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ChefHat className="h-4 w-4 mr-2" />
              Cook
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/plan')}>
              <Calendar className="h-4 w-4 mr-2" />
              Plan
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
