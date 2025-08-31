import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { FeaturedRecipes } from "@/components/FeaturedRecipes";
import { MealPlannerPreview } from "@/components/MealPlannerPreview";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <Hero />
      <FeaturedRecipes />
      <MealPlannerPreview />
    </div>
  );
};

export default Index;
