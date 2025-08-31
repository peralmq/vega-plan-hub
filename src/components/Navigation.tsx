import { Button } from "@/components/ui/button";
import { Leaf } from "lucide-react";

export const Navigation = () => {
  return (
    <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <Leaf className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold text-foreground">Vegan Weekly Meal Plan</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#recipes" className="text-muted-foreground hover:text-foreground transition-colors">
            Recipes
          </a>
          <a href="#planner" className="text-muted-foreground hover:text-foreground transition-colors">
            Meal Planner
          </a>
          <a href="#shopping" className="text-muted-foreground hover:text-foreground transition-colors">
            Shopping List
          </a>
          <Button variant="default" size="sm">
            Get Started
          </Button>
        </div>
      </div>
    </nav>
  );
};