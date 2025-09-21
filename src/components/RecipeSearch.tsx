import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X } from "lucide-react";
import { useState } from "react";

interface RecipeSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedThemes: string[];
  onThemeToggle: (theme: string) => void;
  quickMealsOnly: boolean;
  onQuickMealsToggle: () => void;
  availableThemes: string[];
}

export const RecipeSearch = ({
  searchQuery,
  onSearchChange,
  selectedThemes,
  onThemeToggle,
  quickMealsOnly,
  onQuickMealsToggle,
  availableThemes
}: RecipeSearchProps) => {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchChange(localSearch);
  };

  const clearSearch = () => {
    setLocalSearch("");
    onSearchChange("");
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search recipes by name or ingredient... 🔍"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="pl-10 pr-10 rounded-xl border-2 border-dashed border-border/50 focus:border-primary/50"
        />
        {localSearch && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearSearch}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 rounded-full hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </form>

      {/* Quick Filters */}
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-3">Quick Filters 🎯</h3>
          <div className="flex items-center gap-2">
            <Button
              variant={quickMealsOnly ? "default" : "outline"}
              size="sm"
              onClick={onQuickMealsToggle}
              className="rounded-xl border-2 border-dashed"
            >
              ⚡ Under 30 mins
            </Button>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Themes 🍽️</h3>
          <div className="flex flex-wrap gap-2">
            {availableThemes.map((theme) => (
              <Badge
                key={theme}
                variant={selectedThemes.includes(theme) ? "default" : "outline"}
                className="cursor-pointer rounded-xl border-2 border-dashed hover:border-primary/50 transition-colors"
                onClick={() => onThemeToggle(theme)}
              >
                {theme}
              </Badge>
            ))}
          </div>
        </div>

        {/* Active Filters */}
        {(selectedThemes.length > 0 || quickMealsOnly || searchQuery) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Active filters:</h4>
            <div className="flex flex-wrap gap-2">
              {searchQuery && (
                <Badge variant="secondary" className="rounded-full">
                  Search: "{searchQuery}"
                  <X
                    className="h-3 w-3 ml-1 cursor-pointer"
                    onClick={() => onSearchChange("")}
                  />
                </Badge>
              )}
              {quickMealsOnly && (
                <Badge variant="secondary" className="rounded-full">
                  Quick meals
                  <X
                    className="h-3 w-3 ml-1 cursor-pointer"
                    onClick={onQuickMealsToggle}
                  />
                </Badge>
              )}
              {selectedThemes.map((theme) => (
                <Badge key={theme} variant="secondary" className="rounded-full">
                  {theme}
                  <X
                    className="h-3 w-3 ml-1 cursor-pointer"
                    onClick={() => onThemeToggle(theme)}
                  />
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};