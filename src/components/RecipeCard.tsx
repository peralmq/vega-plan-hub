import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, ShoppingCart } from "lucide-react";
import { useState, useEffect } from "react";
import { MathemPriceService } from "@/services/mathemPriceService";

interface RecipeCardProps {
  title: string;
  image: string;
  cookTime: number;
  servings: number;
  difficulty: "Easy" | "Medium" | "Hard";
  tags: string[];
  theme?: string;
  ingredients?: string[];
}

export const RecipeCard = ({ title, image, cookTime, servings, difficulty, tags, ingredients = [] }: RecipeCardProps) => {
  const [cost, setCost] = useState<{ total: number; currency: string } | null>(null);
  const [loadingCost, setLoadingCost] = useState(false);

  const difficultyColors = {
    Easy: "bg-gradient-fresh text-primary-foreground",
    Medium: "bg-gradient-warm text-primary-foreground", 
    Hard: "bg-gradient-fun text-primary-foreground"
  };

  const isQuickMeal = cookTime <= 30;

  // Load cost data for ingredients
  useEffect(() => {
    const loadCost = async () => {
      if (ingredients.length === 0) return;
      
      setLoadingCost(true);
      try {
        const costData = await MathemPriceService.calculateTotalCost(ingredients);
        setCost({ 
          total: costData.totalCost, 
          currency: costData.currency 
        });
      } catch (error) {
        console.error('Failed to load ingredient costs:', error);
      } finally {
        setLoadingCost(false);
      }
    };

    loadCost();
  }, [ingredients]);

  return (
    <Card className="group overflow-hidden border-0 shadow-playful hover:shadow-glow transition-all duration-300 hover:-translate-y-2 hover:scale-105 rounded-2xl">
      <div className="relative overflow-hidden">
        <img 
          src={image} 
          alt={title}
          className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge className={`${difficultyColors[difficulty]} border-0 rounded-xl shadow-lg`}>
            {difficulty} ✨
          </Badge>
          {isQuickMeal && (
            <Badge className="bg-destructive text-white border-0 rounded-xl shadow-lg animate-pulse">
              ⚡ Quick!
            </Badge>
          )}
        </div>
        {cookTime <= 60 && (
          <div className="absolute top-3 right-3">
            <Badge className="bg-forest text-white border-0 rounded-xl shadow-lg">
              Under 60min 🕐
            </Badge>
          </div>
        )}
      </div>
      
      <div className="p-6 space-y-4">
        <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">
          {title}
        </h3>
        
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1 text-primary font-medium">
            <Clock className="h-4 w-4" />
            <span>{cookTime} mins ⏰</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{servings} portions 🍽️</span>
          </div>
          
          {/* Cost display */}
          <div className="col-span-2 flex items-center gap-1 text-sm">
            <ShoppingCart className="h-4 w-4 text-emerald-600" />
            {loadingCost ? (
              <span className="text-muted-foreground animate-pulse">Loading cost... 💰</span>
            ) : cost ? (
              <span className="font-medium text-emerald-600">
                ~{MathemPriceService.formatPrice(cost.total)} 💰
              </span>
            ) : ingredients.length > 0 ? (
              <span className="text-muted-foreground text-xs">Cost unavailable</span>
            ) : (
              <span className="text-muted-foreground text-xs">No ingredients listed</span>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs rounded-full bg-gradient-warm text-primary-foreground border-0">
              {tag}
            </Badge>
          ))}
          {tags.length > 2 && (
            <Badge variant="outline" className="text-xs rounded-full border-dashed">
              +{tags.length - 2} more
            </Badge>
          )}
        </div>
        
        <div className="text-xs text-muted-foreground text-center border-t pt-3">
          Perfect for dinner planning! 🍽️
        </div>
      </div>
    </Card>
  );
};