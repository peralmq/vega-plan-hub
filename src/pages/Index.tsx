import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { FeaturedRecipes } from "@/components/FeaturedRecipes";
import { InteractiveMealPlanner } from "@/components/InteractiveMealPlanner";
import { MealPlanHistory } from "@/components/MealPlanHistory";
import { Toaster } from "@/components/ui/toaster";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <Hero />
      <FeaturedRecipes />
      <InteractiveMealPlanner />
      <MealPlanHistory />
      <Toaster />
    </div>
  );
};

export default Index;
