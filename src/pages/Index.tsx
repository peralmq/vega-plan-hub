import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { MealPlannerPreview } from "@/components/MealPlannerPreview";
import { Toaster } from "@/components/ui/toaster";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <Hero />
      <MealPlannerPreview />
      <Toaster />
    </div>
  );
};

export default Index;
