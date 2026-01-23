import { RecipeCard } from "./RecipeCard";
import { RecipeSearch } from "./RecipeSearch";
import { SimilarRecipes } from "./SimilarRecipes";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useMealPlans } from "@/hooks/useMealPlans";
import { loadAllRecipes } from "@/services/recipeLoader";

export const FeaturedRecipes = () => {
  const { findSimilarRecipes } = useMealPlans();
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [quickMealsOnly, setQuickMealsOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecipeForSimilar, setSelectedRecipeForSimilar] = useState<any>(null);

  // Load recipes from markdown files
  const featuredRecipes = useMemo(() => loadAllRecipes(), []);

  const handleThemeToggle = (theme: string) => {
    setSelectedThemes(prev => 
      prev.includes(theme) 
        ? prev.filter(t => t !== theme)
        : [...prev, theme]
    );
  };

  const filteredRecipes = featuredRecipes.filter(recipe => {
    const matchesTheme = selectedThemes.length === 0 || selectedThemes.some(theme => 
      recipe.tags.includes(theme) || recipe.theme === theme
    );
    const matchesCookTime = !quickMealsOnly || recipe.cookTime <= 30;
    const matchesSearch = !searchQuery || 
      recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
      recipe.ingredients.some(ing => ing.ingredient.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesTheme && matchesCookTime && matchesSearch;
  });

  const availableThemes = Array.from(new Set(featuredRecipes.flatMap(recipe => recipe.tags)));

  return (
    <section className="py-20 bg-muted/30">
      <div className="container">
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">
            Quick & Delicious <span className="bg-gradient-fun bg-clip-text text-transparent">Recipes</span> 🚀
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            All under 60 minutes! Plant-based recipes perfect for weeknight dinners with tomorrow's lunch sorted 🌱
          </p>
        </div>

        <div className="grid lg:grid-cols-4 gap-8 mb-12">
          {/* Search & Filters Sidebar */}
          <div className="lg:col-span-1">
            <RecipeSearch
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedThemes={selectedThemes}
              onThemeToggle={handleThemeToggle}
              quickMealsOnly={quickMealsOnly}
              onQuickMealsToggle={() => setQuickMealsOnly(!quickMealsOnly)}
              availableThemes={availableThemes}
            />
          </div>

          {/* Recipes Grid */}
          <div className="lg:col-span-3 space-y-8">
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredRecipes.map((recipe, index) => (
                <div key={recipe.id}>
                  <RecipeCard {...recipe} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedRecipeForSimilar(
                      selectedRecipeForSimilar?.id === recipe.id ? null : recipe
                    )}
                    className="mt-2 w-full text-xs text-muted-foreground hover:text-primary"
                  >
                    {selectedRecipeForSimilar?.id === recipe.id 
                      ? "Hide similar recipes" 
                      : "Show similar recipes"}
                  </Button>
                </div>
              ))}
            </div>
            
            {filteredRecipes.length === 0 && (
              <div className="text-center py-12">
                <p className="text-lg text-muted-foreground">
                  No recipes match your search 😅<br/>
                  Try different keywords or filters!
                </p>
              </div>
            )}

            {/* Similar Recipes Section */}
            {selectedRecipeForSimilar && (
              <SimilarRecipes
                recipe={selectedRecipeForSimilar}
                similarRecipes={findSimilarRecipes(selectedRecipeForSimilar, featuredRecipes)}
              />
            )}
          </div>
        </div>

        <div className="text-center">
          <Link to="/recipes">
            <Button variant="outline" size="lg" className="rounded-xl border-2 border-dashed hover:border-primary/50">
              🍽️ Browse All Recipes
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};