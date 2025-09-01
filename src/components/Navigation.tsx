import { Button } from "@/components/ui/button";
import { Leaf } from "lucide-react";
import { Link } from "react-router-dom";

export const Navigation = () => {
  return (
    <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Leaf className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold text-foreground">Vegan Weekly Meal Plan</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link 
            to="/recipes" 
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Recipes
          </Link>
          <Link 
            to="/meal-planner" 
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Meal Planner
          </Link>
          <Link 
            to="/shopping-list" 
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Shopping List
          </Link>
          <Link to="/meal-planner">
            <Button variant="default" size="sm">
              Get Started
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
};