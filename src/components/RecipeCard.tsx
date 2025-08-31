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
}

export const RecipeCard = ({ title, image, cookTime, servings, difficulty, tags }: RecipeCardProps) => {
  const difficultyColors = {
    Easy: "bg-gradient-fresh text-primary-foreground",
    Medium: "bg-gradient-warm text-primary-foreground", 
    Hard: "bg-gradient-primary text-primary-foreground"
  };

  return (
    <Card className="group overflow-hidden border-0 shadow-fresh hover:shadow-glow transition-all duration-300 hover:-translate-y-1">
      <div className="relative overflow-hidden">
        <img 
          src={image} 
          alt={title}
          className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute top-3 left-3">
          <Badge className={`${difficultyColors[difficulty]} border-0`}>
            {difficulty}
          </Badge>
        </div>
      </div>
      
      <div className="p-6 space-y-4">
        <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors">
          {title}
        </h3>
        
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{cookTime}min</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{servings} servings</span>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  );
};