import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Users, Lightbulb } from "lucide-react";
import { Recipe } from "@/hooks/useMealPlans";
import type { ParsedIngredient } from "@/services/recipeLoader";

interface SimilarRecipesProps {
  recipe: Recipe;
  similarRecipes: Recipe[];
  onRecipeSelect?: (recipe: Recipe) => void;
}

export const SimilarRecipes = ({ recipe, similarRecipes, onRecipeSelect }: SimilarRecipesProps) => {
  if (similarRecipes.length === 0) {
    return null;
  }

  const getCommonIngredients = (recipe1: Recipe, recipe2: Recipe): ParsedIngredient[] => {
    const ingredients1Keys = new Set(recipe1.ingredients.map(ing => (ing.key || ing.ingredient).toLowerCase()));
    return recipe2.ingredients.filter(ing => ingredients1Keys.has((ing.key || ing.ingredient).toLowerCase()));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">
          Similar Recipes <span className="text-muted-foreground text-sm">(to reduce shopping)</span>
        </h3>
      </div>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {similarRecipes.map((similarRecipe) => {
          const commonIngredients = getCommonIngredients(recipe, similarRecipe);
          
          return (
            <Card 
              key={similarRecipe.id}
              className="p-4 border-2 border-dashed border-primary/20 hover:border-primary/50 transition-all duration-200 hover:shadow-playful"
            >
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <img 
                    src={similarRecipe.image} 
                    alt={similarRecipe.title}
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm leading-tight truncate">
                      {similarRecipe.title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {similarRecipe.cookTime}min
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {similarRecipe.servings}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs">
                    <span className="font-medium text-emerald-600">
                      {commonIngredients.length} shared ingredients:
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {commonIngredients.slice(0, 3).map((ingredient, index) => (
                      <Badge 
                        key={index}
                        variant="secondary" 
                        className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 border-0"
                      >
                        {ingredient.ingredient}
                      </Badge>
                    ))}
                    {commonIngredients.length > 3 && (
                      <Badge 
                        variant="outline" 
                        className="text-[10px] px-1.5 py-0.5 border-dashed"
                      >
                        +{commonIngredients.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>

                {onRecipeSelect && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRecipeSelect(similarRecipe)}
                    className="w-full text-xs rounded-lg border-2 border-dashed hover:border-primary/50"
                  >
                    Add to Plan
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};