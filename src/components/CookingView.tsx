import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Users, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface Recipe {
  id: string;
  title: string;
  image: string;
  cookTime: number;
  servings: number;
  difficulty: "Easy" | "Medium" | "Hard";
  ingredients: string[];
  instructions: string[];
}

// Extended recipe data with instructions
const recipes: Recipe[] = [
  {
    id: "1",
    title: "Mediterranean Buddha Bowl",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop",
    cookTime: 25,
    servings: 4,
    difficulty: "Easy",
    ingredients: ["200g pasta", "200g cherry tomatoes", "100g olives", "3 tbsp olive oil", "3 cloves garlic", "Fresh basil leaves"],
    instructions: [
      "Bring a large pot of salted water to boil and cook pasta according to package instructions",
      "While pasta cooks, heat olive oil in a large pan over medium heat",
      "Add minced garlic and cook for 1 minute until fragrant",
      "Add halved cherry tomatoes and cook for 5-7 minutes until softened",
      "Drain pasta and add to the pan with tomatoes",
      "Stir in olives and fresh basil leaves",
      "Season with salt and pepper, serve immediately"
    ]
  },
  {
    id: "2", 
    title: "Creamy Mushroom Risotto",
    image: "https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=400&h=300&fit=crop",
    cookTime: 35,
    servings: 6,
    difficulty: "Medium",
    ingredients: ["300g arborio rice", "500g mixed mushrooms", "1L vegetable broth", "3 tbsp nutritional yeast", "125ml white wine", "1 large onion"],
    instructions: [
      "Heat vegetable broth in a saucepan and keep warm over low heat",
      "Dice onion finely and slice mushrooms",
      "Heat oil in a large pan, sauté onions until translucent (5 mins)",
      "Add mushrooms and cook until golden brown (8-10 mins)",
      "Add arborio rice and stir for 2 minutes until lightly toasted",
      "Pour in white wine and stir until absorbed",
      "Add warm broth one ladle at a time, stirring constantly",
      "Continue adding broth and stirring for 18-20 minutes until rice is creamy",
      "Stir in nutritional yeast, season with salt and pepper"
    ]
  },
  {
    id: "3",
    title: "Thai Green Curry",
    image: "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=400&h=300&fit=crop",
    cookTime: 30,
    servings: 4,
    difficulty: "Medium",
    ingredients: ["400ml coconut milk", "2 tbsp Thai green curry paste", "300g mixed vegetables", "200g jasmine rice", "1 lime", "Thai basil leaves"],
    instructions: [
      "Cook jasmine rice according to package instructions",
      "Heat half the coconut milk in a large pan over medium heat",
      "Add curry paste and cook for 2-3 minutes until fragrant",
      "Add remaining coconut milk and bring to a gentle simmer",
      "Add mixed vegetables and simmer for 15-20 minutes",
      "Squeeze in lime juice and add Thai basil leaves",
      "Taste and adjust seasoning",
      "Serve over jasmine rice"
    ]
  },
  {
    id: "4",
    title: "Rainbow Veggie Stir-fry",
    image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop",
    cookTime: 15,
    servings: 3,
    difficulty: "Easy",
    ingredients: ["2 bell peppers", "1 head broccoli", "2 carrots", "3 tbsp soy sauce", "1 inch ginger", "3 cloves garlic", "2 tbsp sesame oil"],
    instructions: [
      "Cut all vegetables into bite-sized pieces",
      "Mince garlic and ginger finely",
      "Heat sesame oil in a large wok or pan over high heat",
      "Add garlic and ginger, stir-fry for 30 seconds",
      "Add carrots first and stir-fry for 2 minutes",
      "Add broccoli and stir-fry for 2 minutes",
      "Add bell peppers and stir-fry for 2-3 minutes",
      "Add soy sauce and toss everything together",
      "Serve immediately while vegetables are crisp-tender"
    ]
  },
  {
    id: "5",
    title: "Spicy Lentil Tacos",
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=300&fit=crop",
    cookTime: 20,
    servings: 4,
    difficulty: "Easy",
    ingredients: ["200g red lentils", "1 onion", "3 cloves garlic", "1 bell pepper", "1 lime", "2 tbsp nutritional yeast"],
    instructions: [
      "Rinse lentils and cook in boiling water for 15 minutes until tender",
      "Dice onion, garlic, and bell pepper",
      "Heat oil in a large pan over medium heat",
      "Sauté onion until translucent (5 minutes)",
      "Add garlic and bell pepper, cook for 3 minutes",
      "Drain lentils and add to the pan",
      "Season with spices, lime juice, and nutritional yeast",
      "Cook for 2-3 minutes, mashing slightly",
      "Serve in taco shells with your favorite toppings"
    ]
  },
  {
    id: "6",
    title: "Stuffed Bell Peppers",
    image: "https://images.unsplash.com/photo-1571197724963-f0d1b5d2ec44?w=400&h=300&fit=crop",
    cookTime: 45,
    servings: 4,
    difficulty: "Medium",
    ingredients: ["4 large bell peppers", "200g jasmine rice", "200g mushrooms", "1 onion", "3 cloves garlic", "3 tbsp nutritional yeast"],
    instructions: [
      "Preheat oven to 190°C (375°F)",
      "Cut tops off bell peppers and remove seeds and membranes",
      "Cook rice according to package instructions",
      "Dice onion, garlic, and mushrooms",
      "Heat oil in a pan, sauté onion until soft (5 minutes)",
      "Add garlic and mushrooms, cook until mushrooms are golden",
      "Mix cooked rice with sautéed vegetables and nutritional yeast",
      "Stuff peppers with rice mixture",
      "Place in baking dish with a little water at the bottom",
      "Cover with foil and bake for 35 minutes",
      "Remove foil and bake 10 minutes more until peppers are tender"
    ]
  }
];

export const CookingView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  
  const recipe = recipes.find(r => r.id === id);
  
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
            <div className="text-sm text-muted-foreground">
              Cooking Mode 👨‍🍳
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
                {recipe.ingredients.map((ingredient, index) => (
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
            </Card>

            {/* Instructions */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold mb-6 text-center">
                Cooking Instructions 👨‍🍳
              </h2>
              {recipe.instructions.map((instruction, index) => (
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
              {completedSteps.length === recipe.instructions.length && (
                <Card className="p-6 bg-gradient-fun text-white text-center animate-pulse">
                  <h3 className="text-2xl font-bold mb-2">🎉 Well Done!</h3>
                  <p className="text-lg">Your {recipe.title} is ready to enjoy!</p>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};