import { Button } from "@/components/ui/button";
import { Calendar, ChefHat, ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-vegan-meal-planning.jpg";

export const Hero = () => {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-fresh opacity-10" />
      <div className="container relative">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-6xl font-bold leading-tight">
                Plan Your Perfect
                <span className="bg-gradient-primary bg-clip-text text-transparent block">
                  Vegan Week
                </span>
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Discover delicious plant-based recipes, create weekly meal plans, and generate 
                smart shopping lists. Make vegan meal planning effortless and enjoyable.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/meal-planner">
                <Button size="lg" className="bg-gradient-primary hover:shadow-fresh transition-all duration-300">
                  Start Planning
                </Button>
              </Link>
              <Link to="/recipes">
                <Button variant="outline" size="lg">
                  Browse Recipes
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-6 pt-8">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-gradient-fresh rounded-lg flex items-center justify-center mx-auto">
                  <ChefHat className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="font-semibold">1000+ Recipes</h3>
                <p className="text-sm text-muted-foreground">Curated vegan dishes</p>
              </div>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-gradient-fresh rounded-lg flex items-center justify-center mx-auto">
                  <Calendar className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="font-semibold">Smart Planning</h3>
                <p className="text-sm text-muted-foreground">7-day meal planner</p>
              </div>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-gradient-fresh rounded-lg flex items-center justify-center mx-auto">
                  <ShoppingCart className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="font-semibold">Auto Lists</h3>
                <p className="text-sm text-muted-foreground">Generated shopping</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden shadow-fresh">
              <img 
                src={heroImage}
                alt="Fresh vegan ingredients - colorful vegetables and herbs on a wooden table"
                className="w-full h-[600px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>
            <div className="absolute -bottom-6 -left-6 bg-card border border-border rounded-xl p-6 shadow-glow">
              <div className="text-sm text-muted-foreground">This week's plan</div>
              <div className="text-2xl font-bold text-primary">7 meals ready</div>
              <div className="text-sm text-muted-foreground">Shopping list generated</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};