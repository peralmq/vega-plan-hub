import { RecipeCard } from "./RecipeCard";
import { Button } from "@/components/ui/button";

// Mock data - in real app this would come from your API
const featuredRecipes = [
  {
    title: "Mediterranean Buddha Bowl",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop",
    cookTime: 25,
    servings: 2,
    difficulty: "Easy" as const,
    tags: ["Healthy", "Mediterranean", "Bowl"]
  },
  {
    title: "Creamy Mushroom Risotto", 
    image: "https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=400&h=300&fit=crop",
    cookTime: 35,
    servings: 4,
    difficulty: "Medium" as const,
    tags: ["Comfort", "Italian", "Mushroom"]
  },
  {
    title: "Thai Green Curry",
    image: "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=400&h=300&fit=crop",
    cookTime: 30,
    servings: 3,
    difficulty: "Medium" as const,
    tags: ["Spicy", "Thai", "Coconut"]
  },
  {
    title: "Rainbow Veggie Stir-fry",
    image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop",
    cookTime: 15,
    servings: 2,
    difficulty: "Easy" as const,
    tags: ["Quick", "Colorful", "Asian"]
  }
];

export const FeaturedRecipes = () => {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container">
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">
            Featured <span className="bg-gradient-fresh bg-clip-text text-transparent">Recipes</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Discover our most popular plant-based recipes, loved by the community
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {featuredRecipes.map((recipe, index) => (
            <RecipeCard key={index} {...recipe} />
          ))}
        </div>

        <div className="text-center">
          <Button variant="outline" size="lg">
            Browse All Recipes
          </Button>
        </div>
      </div>
    </section>
  );
};