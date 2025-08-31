import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users } from "lucide-react";

interface RecipeCardProps {
  title: string;
  image: string;
  cookTime: number;
  servings: number;
  difficulty: "Easy" | "Medium" | "Hard";
  tags: string[];
  theme?: string;
}

export const RecipeCard = ({ title, image, cookTime, servings, difficulty, tags }: RecipeCardProps) => {
  const difficultyColors = {
    Easy: "bg-gradient-fresh text-primary-foreground",
    Medium: "bg-gradient-warm text-primary-foreground", 
    Hard: "bg-gradient-fun text-primary-foreground"
  };

  const isQuickMeal = cookTime <= 30;

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
        
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-primary font-medium">
            <Clock className="h-4 w-4" />
            <span>{cookTime} mins ⏰</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{servings} portions 🍽️</span>
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
          Perfect for dinner + leftovers! 🥡
        </div>
      </div>
    </Card>
  );
};