import { Navigation } from "@/components/Navigation";
import { FeaturedRecipes } from "@/components/FeaturedRecipes";
import { Toaster } from "@/components/ui/toaster";

const Recipes = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <div className="py-20">
        <div className="container">
          <div className="text-center space-y-4 mb-12">
            <h1 className="text-4xl md:text-6xl font-bold leading-tight">
              Browse <span className="bg-gradient-fun bg-clip-text text-transparent">Recipes</span> 🍽️
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Discover delicious plant-based recipes, all under 60 minutes! Perfect for weeknight dinners 🌱
            </p>
          </div>
        </div>
      </div>
      <FeaturedRecipes />
      <Toaster />
    </div>
  );
};

export default Recipes;