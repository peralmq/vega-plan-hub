import { Navigation } from "@/components/Navigation";
import { InteractiveMealPlanner } from "@/components/InteractiveMealPlanner";
import { MealPlanHistory } from "@/components/MealPlanHistory";
import { Toaster } from "@/components/ui/toaster";

const MealPlanner = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <div className="py-20">
        <div className="container">
          <div className="text-center space-y-4 mb-12">
            <h1 className="text-4xl md:text-6xl font-bold leading-tight">
              Weekly <span className="bg-gradient-fun bg-clip-text text-transparent">Meal Planner</span> 📅
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Plan your perfect vegan week! Create meal plans and keep track of your favorites 🌟
            </p>
          </div>
        </div>
      </div>
      <InteractiveMealPlanner />
      <MealPlanHistory />
      <Toaster />
    </div>
  );
};

export default MealPlanner;