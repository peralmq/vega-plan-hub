import { RecipeCard } from "./RecipeCard";
import { RecipeFilters } from "./RecipeFilters";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link } from "react-router-dom";

// Mock data - in real app this would come from your API
const featuredRecipes = [
  {
    title: "Mediterranean Buddha Bowl",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop",
    cookTime: 25,
    servings: 4,
    difficulty: "Easy" as const,
    tags: ["Mediterranean", "Fresh & Light"],
    theme: "Mediterranean"
  },
  {
    title: "Creamy Mushroom Risotto", 
    image: "https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=400&h=300&fit=crop",
    cookTime: 35,
    servings: 6,
    difficulty: "Medium" as const,
    tags: ["Comfort Food", "Hearty & Filling"],
    theme: "Comfort Food"
  },
  {
    title: "Thai Green Curry",
    image: "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=400&h=300&fit=crop",
    cookTime: 30,
    servings: 4,
    difficulty: "Medium" as const,
    tags: ["Asian Fusion", "Spicy Heat"],
    theme: "Asian Fusion"
  },
  {
    title: "Rainbow Veggie Stir-fry",
    image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop",
    cookTime: 15,
    servings: 3,
    difficulty: "Easy" as const,
    tags: ["Asian Fusion", "Fresh & Light"],
    theme: "Asian Fusion"
  },
  {
    title: "Spicy Lentil Tacos",
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=300&fit=crop",
    cookTime: 20,
    servings: 4,
    difficulty: "Easy" as const,
    tags: ["Spicy Heat", "Comfort Food"],
    theme: "Spicy Heat"
  },
  {
    title: "Stuffed Bell Peppers",
    image: "https://images.unsplash.com/photo-1571197724963-f0d1b5d2ec44?w=400&h=300&fit=crop",
    cookTime: 45,
    servings: 4,
    difficulty: "Medium" as const,
    tags: ["Hearty & Filling", "Mediterranean"],
    theme: "Mediterranean"
  }
];

export const FeaturedRecipes = () => {
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [quickMealsOnly, setQuickMealsOnly] = useState(false);

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
    const matchesCookTime = !quickMealsOnly || recipe.cookTime <= 60;
    return matchesTheme && matchesCookTime;
  });

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
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <RecipeFilters
              selectedThemes={selectedThemes}
              onThemeToggle={handleThemeToggle}
              quickMealsOnly={quickMealsOnly}
              onQuickMealsToggle={() => setQuickMealsOnly(!quickMealsOnly)}
            />
          </div>

          {/* Recipes Grid */}
          <div className="lg:col-span-3">
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredRecipes.map((recipe, index) => (
                <RecipeCard key={index} {...recipe} />
              ))}
            </div>
            
            {filteredRecipes.length === 0 && (
              <div className="text-center py-12">
                <p className="text-lg text-muted-foreground">
                  No recipes match your filters 😅<br/>
                  Try adjusting your theme selections!
                </p>
              </div>
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