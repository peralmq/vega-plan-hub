import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ShoppingCart,
  ChefHat,
  Printer,
  Copy,
  Package,
  ArrowLeft,
  MessageCircle,
} from "lucide-react";
import { useBatchPool } from "@/hooks/useBatchPool";
import { useProductPreferences } from "@/hooks/useProductPreferences";
import { ParsedRecipe, ParsedIngredient } from "@/services/recipeLoader";
import { groupPoolByRecipe } from "@/lib/planPool";
import { aggregateIngredients, formatAggregatedIngredient } from "@/lib/ingredientNormalization";
import { applyPreferredNames } from "@/lib/productPreferences";
import { scaleIngredients } from "@/lib/ingredientScaling";
import { toast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CompassionFooter } from "@/components/CompassionFooter";

export default function ShoppingSummary() {
  const navigate = useNavigate();
  const { currentBatch, loading } = useBatchPool();
  const { preferences } = useProductPreferences();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const pool = useMemo(() => currentBatch?.meals ?? [], [currentBatch]);
  const groups = useMemo(() => groupPoolByRecipe(pool), [pool]);
  const groupCount = (recipeId: string) =>
    groups.find(g => g.recipeId === recipeId)?.count ?? 1;

  // Every dish in the active batch's pool, with its own multiplier — the
  // shopping list covers the whole batch, cooked or not.
  const mealsWithMultipliers = useMemo(() => {
    return pool
      .filter(m => m.recipe)
      .map(m => ({
        recipe: m.recipe as ParsedRecipe,
        servingsMultiplier: m.servingsMultiplier,
      }));
  }, [pool]);

  const recipes = mealsWithMultipliers.map(m => m.recipe);

  const aggregatedIngredients = useMemo(() => {
    const allIngredients: Array<{ ingredient: ParsedIngredient; recipeName: string }> = [];

    mealsWithMultipliers.forEach(({ recipe, servingsMultiplier }) => {
      if (!recipe.ingredients) return;

      const targetServings = Math.round(recipe.servings * servingsMultiplier);
      const scaledIngredients = scaleIngredients(recipe.ingredients, recipe.servings, targetServings);

      scaledIngredients.forEach(ing => {
        allIngredients.push({ ingredient: ing, recipeName: recipe.title });
      });
    });

    // "mjölk" shows as the household's currently preferred product when a
    // preference row exists (p4-01 read path; the table ships empty).
    return applyPreferredNames(aggregateIngredients(allIngredients), preferences);
  }, [mealsWithMultipliers, preferences]);

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

    const rangeLabel = currentBatch ? `${currentBatch.startsOn} → ${currentBatch.endsOn}` : '';
    navigator.clipboard.writeText(`Shopping List for ${rangeLabel}\n\n${text}`);
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

  if (!currentBatch || recipes.length === 0) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header />
        <div className="container py-20">
          <Card className="max-w-xl mx-auto p-8 text-center">
            <ShoppingCart className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
            <h2 className="text-2xl font-bold mb-4">No active batch yet</h2>
            <p className="text-muted-foreground mb-6 flex items-center justify-center gap-1 flex-wrap">
              No active batch — plan one in chat <MessageCircle className="h-4 w-4 inline" /> 💬
            </p>
            <Button onClick={() => navigate('/plan')} className="bg-primary text-primary-foreground rounded-full">
              Go to Plan Mode
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
        <Card className="p-6 mb-6 bg-primary text-primary-foreground text-center print:hidden">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Package className="h-6 w-6" />
            <h2 className="text-xl font-bold">Batch {currentBatch.startsOn} → {currentBatch.endsOn}</h2>
          </div>
          <p>Here's your shopping list for the active batch.</p>
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

          {/* Batch Pool Sidebar */}
          <div className="print:hidden">
            <Card className="p-6 sticky top-24">
              <div className="flex items-center gap-2 mb-4">
                <Package className="h-5 w-5 text-primary" />
                <h3 className="font-bold">Batch Pool</h3>
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
                      <div className="font-medium text-sm truncate flex items-center gap-2">
                        {recipe.title}
                        {groupCount(recipe.id) > 1 && (
                          <Badge variant="outline" className="text-xs shrink-0">🍱 ×{groupCount(recipe.id)}</Badge>
                        )}
                      </div>
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
            Edit Pool
          </Button>
          <Button
            onClick={() => navigate('/')}
            className="bg-primary text-primary-foreground rounded-full"
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
      <CompassionFooter />
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
              <Package className="h-4 w-4 mr-2" />
              Plan
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
