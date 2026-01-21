import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Users, CheckCircle2, ExternalLink } from "lucide-react";
import { useState, useMemo } from "react";
import { getRecipeById } from "@/services/recipeLoader";
import type { ParsedRecipe } from "@/services/recipeLoader";

export const CookingView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  
  // Load recipe from markdown files
  const recipe = useMemo(() => {
    if (!id) return undefined;
    return getRecipeById(id);
  }, [id]);
  
  if (!recipe) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Recipe not found</h1>
          <Button onClick={() => navigate('/recipes')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Recipes
          </Button>
        </div>
      </div>
    );
  }

  const toggleStep = (stepIndex: number) => {
    setCompletedSteps(prev => 
      prev.includes(stepIndex) 
        ? prev.filter(i => i !== stepIndex)
        : [...prev, stepIndex]
    );
  };

  const difficultyColors = {
    Easy: "bg-gradient-fresh text-primary-foreground",
    Medium: "bg-gradient-warm text-primary-foreground", 
    Hard: "bg-gradient-fun text-primary-foreground"
  };

  const instructions = recipe.instructions || [];
  const ingredients = recipe.ingredients || [];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-background shadow-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              onClick={() => navigate('/recipes')}
              className="text-lg"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Recipes
            </Button>
            <div className="flex items-center gap-2">
              {recipe.url && (
                <a href={recipe.url} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Original
                  </Button>
                </a>
              )}
              <span className="text-sm text-muted-foreground">
                Cooking Mode 👨‍🍳
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-6">
        <div className="max-w-4xl mx-auto">
          {/* Recipe Header */}
          <div className="mb-8">
            <div className="relative rounded-2xl overflow-hidden mb-6">
              <img 
                src={recipe.image} 
                alt={recipe.title}
                className="w-full h-64 md:h-80 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  {recipe.title}
                </h1>
                <div className="flex gap-4 flex-wrap">
                  <Badge className={`${difficultyColors[recipe.difficulty]} border-0 rounded-xl text-base px-4 py-2`}>
                    {recipe.difficulty} ✨
                  </Badge>
                  <Badge className="bg-black/20 text-white border-0 rounded-xl text-base px-4 py-2">
                    <Clock className="w-4 h-4 mr-2" />
                    {recipe.cookTime} mins
                  </Badge>
                  <Badge className="bg-black/20 text-white border-0 rounded-xl text-base px-4 py-2">
                    <Users className="w-4 h-4 mr-2" />
                    {recipe.servings} servings
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Two Column Layout for Tablet */}
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Ingredients */}
            <Card className="p-6 h-fit sticky top-24">
              <h2 className="text-2xl font-bold mb-6 text-center">
                Ingredients 🛒
              </h2>
              <div className="space-y-4">
                {ingredients.map((ingredient, index) => (
                  <div 
                    key={index}
                    className="flex items-center p-4 bg-muted/50 rounded-xl text-lg"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center mr-4 text-sm">
                      {index + 1}
                    </div>
                    <span className="font-medium">{ingredient}</span>
                  </div>
                ))}
              </div>
              
              {/* Notes Section */}
              {recipe.notes && recipe.notes.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h3 className="text-lg font-bold mb-4 text-center">💡 Tips</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {recipe.notes.map((note, index) => (
                      <li key={index} className="flex gap-2">
                        <span>•</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {/* Instructions */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold mb-6 text-center">
                Cooking Instructions 👨‍🍳
              </h2>
              {instructions.length > 0 ? (
                <>
                  {instructions.map((instruction, index) => (
                    <Card 
                      key={index}
                      className={`p-6 cursor-pointer transition-all duration-300 ${
                        completedSteps.includes(index) 
                          ? 'bg-primary/10 border-primary/50' 
                          : 'hover:shadow-md'
                      }`}
                      onClick={() => toggleStep(index)}
                    >
                      <div className="flex gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${
                          completedSteps.includes(index)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {completedSteps.includes(index) ? (
                            <CheckCircle2 className="w-6 h-6" />
                          ) : (
                            index + 1
                          )}
                        </div>
                        <div className="flex-1">
                          <p className={`text-lg leading-relaxed ${
                            completedSteps.includes(index) 
                              ? 'line-through text-muted-foreground' 
                              : ''
                          }`}>
                            {instruction}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                  
                  {/* Completion Message */}
                  {completedSteps.length === instructions.length && instructions.length > 0 && (
                    <Card className="p-6 bg-gradient-fun text-white text-center animate-pulse">
                      <h3 className="text-2xl font-bold mb-2">🎉 Well Done!</h3>
                      <p className="text-lg">Your {recipe.title} is ready to enjoy!</p>
                    </Card>
                  )}
                </>
              ) : (
                <Card className="p-6 text-center text-muted-foreground">
                  <p>No detailed instructions available for this recipe.</p>
                  {recipe.url && (
                    <a href={recipe.url} target="_blank" rel="noopener noreferrer">
                      <Button variant="link" className="mt-2">
                        View original recipe <ExternalLink className="w-4 h-4 ml-1" />
                      </Button>
                    </a>
                  )}
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};