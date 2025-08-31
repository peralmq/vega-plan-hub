import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Filter } from "lucide-react";

interface RecipeFiltersProps {
  selectedThemes: string[];
  onThemeToggle: (theme: string) => void;
  quickMealsOnly: boolean;
  onQuickMealsToggle: () => void;
}

const themes = [
  { name: "Mediterranean", emoji: "🌊", color: "bg-gradient-fresh" },
  { name: "Asian Fusion", emoji: "🥢", color: "bg-gradient-warm" },
  { name: "Comfort Food", emoji: "🤗", color: "bg-gradient-primary" },
  { name: "Fresh & Light", emoji: "🌱", color: "bg-forest text-white" },
  { name: "Hearty & Filling", emoji: "💪", color: "bg-carrot text-white" },
  { name: "Spicy Heat", emoji: "🌶️", color: "bg-destructive text-white" }
];

export const RecipeFilters = ({ 
  selectedThemes, 
  onThemeToggle, 
  quickMealsOnly, 
  onQuickMealsToggle 
}: RecipeFiltersProps) => {
  return (
    <div className="space-y-6 p-6 bg-muted/30 rounded-2xl border-2 border-dashed border-primary/20">
      <div className="flex items-center gap-2">
        <Filter className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-lg">Filter Your Perfect Week 🎯</h3>
      </div>
      
      {/* Quick Meals Filter */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm text-muted-foreground">⏰ COOKING TIME</h4>
        <Button
          variant={quickMealsOnly ? "default" : "outline"}
          onClick={onQuickMealsToggle}
          className={`w-full justify-start gap-2 rounded-xl ${
            quickMealsOnly 
              ? "bg-gradient-fun shadow-playful" 
              : "border-2 border-dashed hover:border-primary/50"
          }`}
        >
          <Clock className="h-4 w-4" />
          Under 60 Minutes Only ⚡
        </Button>
      </div>
      
      {/* Theme Filters */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm text-muted-foreground">🎨 WEEKLY THEMES</h4>
        <div className="grid grid-cols-2 gap-2">
          {themes.map((theme) => (
            <Button
              key={theme.name}
              variant={selectedThemes.includes(theme.name) ? "default" : "outline"}
              onClick={() => onThemeToggle(theme.name)}
              className={`justify-start gap-2 rounded-xl text-xs ${
                selectedThemes.includes(theme.name)
                  ? `${theme.color} shadow-playful border-0`
                  : "border-2 border-dashed hover:border-primary/50"
              }`}
            >
              <span>{theme.emoji}</span>
              {theme.name}
            </Button>
          ))}
        </div>
      </div>
      
      {(selectedThemes.length > 0 || quickMealsOnly) && (
        <div className="pt-3 border-t border-border">
          <p className="text-sm text-muted-foreground text-center">
            🎉 Filtering recipes to match your preferences!
          </p>
        </div>
      )}
    </div>
  );
};