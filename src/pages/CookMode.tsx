import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  Users, 
  CheckCircle2, 
  ExternalLink, 
  Minus, 
  Plus,
  Calendar,
  ChefHat,
  LogOut,
  CalendarPlus,
  ArrowRight
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMealPlanDB } from "@/hooks/useMealPlanDB";
import { convertIngredientToMetric, formatQuantityMetric } from "@/lib/ingredientNormalization";
import { ParsedRecipe } from "@/services/recipeLoader";
import { format } from "date-fns";

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function CookMode() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { 
    currentWeekPlan, 
    loading, 
    hasCurrentWeekPlan, 
    hasNextWeekPlan,
    getRemainingMeals,
    getRecipeForDay,
    getTodayIndex,
    getCurrentMonday,
  } = useMealPlanDB();

  // Get today's day of week (0=Monday, 6=Sunday)
  const todayIndex = getTodayIndex();
  
  const [selectedDay, setSelectedDay] = useState<number>(todayIndex);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [targetServings, setTargetServings] = useState<number | null>(null);

  const selectedRecipe = getRecipeForDay(selectedDay);
  const remainingMeals = getRemainingMeals();

  // Initialize servings when recipe changes
  useMemo(() => {
    if (selectedRecipe && targetServings === null) {
      setTargetServings(selectedRecipe.servings);
    }
  }, [selectedRecipe, targetServings]);

  // Reset completed steps when changing recipes
  useMemo(() => {
    setCompletedSteps([]);
    setTargetServings(selectedRecipe?.servings || null);
  }, [selectedDay]);

  // Scale ingredients and convert to metric
  const scaledIngredients = useMemo(() => {
    if (!selectedRecipe || !targetServings) return [];
    const scaleFactor = targetServings / selectedRecipe.servings;
    
    return selectedRecipe.ingredients.map(ing => {
      // Scale the quantity
      const originalQty = parseFloat(ing.quantity) || 0;
      const scaledQty = originalQty * scaleFactor;
      const scaledIng = {
        ...ing,
        quantity: scaledQty > 0 ? scaledQty.toString() : ing.quantity,
      };
      // Convert to metric
      return convertIngredientToMetric(scaledIng);
    });
  }, [selectedRecipe, targetServings]);

  const toggleStep = (stepIndex: number) => {
    setCompletedSteps(prev => 
      prev.includes(stepIndex) 
        ? prev.filter(i => i !== stepIndex)
        : [...prev, stepIndex]
    );
  };

  const adjustServings = (delta: number) => {
    if (!targetServings) return;
    const newServings = Math.max(1, Math.min(20, targetServings + delta));
    setTargetServings(newServings);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your meals...</p>
        </div>
      </div>
    );
  }

  // No current week plan - offer to plan remaining days
  if (!hasCurrentWeekPlan()) {
    const remainingDays = 7 - todayIndex;
    const currentWeekLabel = format(getCurrentMonday(), 'MMM d');
    
    return (
      <div className="min-h-screen bg-muted/30">
        <Header user={user} onSignOut={handleSignOut} />
        
        <div className="container py-20">
          <div className="max-w-xl mx-auto text-center">
            <Card className="p-8 border-2 border-dashed border-primary/20">
              <ChefHat className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
              <h2 className="text-2xl font-bold mb-4">No meals planned for this week</h2>
              <p className="text-muted-foreground mb-6">
                You have {remainingDays} day{remainingDays !== 1 ? 's' : ''} left this week (including today).
                Plan your meals now or prepare for next week!
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button 
                  size="lg"
                  onClick={() => navigate('/plan', { state: { planCurrentWeek: true } })}
                  className="bg-gradient-fun text-white rounded-xl"
                >
                  <CalendarPlus className="h-5 w-5 mr-2" />
                  Plan This Week
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button 
                  size="lg"
                  variant="outline"
                  onClick={() => navigate('/plan')}
                  className="rounded-xl"
                >
                  Plan Next Week
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const currentServings = targetServings || selectedRecipe?.servings || 4;
  const instructions = selectedRecipe?.instructions || [];

  const difficultyColors = {
    Easy: "bg-gradient-fresh text-primary-foreground",
    Medium: "bg-gradient-warm text-primary-foreground", 
    Hard: "bg-gradient-fun text-primary-foreground"
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header user={user} onSignOut={handleSignOut} />

      <div className="container py-6">
        {/* Day Selector */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">This Week's Meals</h2>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {DAY_NAMES.map((day, index) => {
              const meal = currentWeekPlan?.meals.find(m => m.dayOfWeek === index);
              const isToday = index === todayIndex;
              const isSelected = index === selectedDay;
              const hasMeal = !!meal;

              return (
                <Button
                  key={day}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => hasMeal && setSelectedDay(index)}
                  disabled={!hasMeal}
                  className={`flex-shrink-0 min-w-[80px] ${
                    isSelected 
                      ? 'bg-gradient-fun text-white border-0' 
                      : isToday 
                        ? 'border-primary border-2' 
                        : ''
                  } ${!hasMeal ? 'opacity-50' : ''}`}
                >
                  <div className="text-center">
                    <div className="text-xs">{day.slice(0, 3)}</div>
                    {hasMeal && <div className="text-lg">🍲</div>}
                    {!hasMeal && <div className="text-lg opacity-50">-</div>}
                  </div>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Recipe Content */}
        {selectedRecipe ? (
          <div className="max-w-4xl mx-auto">
            {/* Recipe Header */}
            <div className="mb-8">
              <div className="relative rounded-2xl overflow-hidden mb-6">
                <img 
                  src={selectedRecipe.image} 
                  alt={selectedRecipe.title}
                  className="w-full h-48 md:h-64 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <Badge variant="secondary" className="mb-2">
                    {DAY_NAMES[selectedDay]}'s Dinner
                  </Badge>
                  <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">
                    {selectedRecipe.title}
                  </h1>
                  <div className="flex gap-3 flex-wrap">
                    <Badge className={`${difficultyColors[selectedRecipe.difficulty]} border-0 rounded-lg px-3 py-1`}>
                      {selectedRecipe.difficulty}
                    </Badge>
                    <Badge className="bg-black/20 text-white border-0 rounded-lg px-3 py-1">
                      <Clock className="w-3 h-3 mr-1" />
                      {selectedRecipe.cookTime} mins
                    </Badge>
                    <Badge className="bg-black/20 text-white border-0 rounded-lg px-3 py-1">
                      <Users className="w-3 h-3 mr-1" />
                      {currentServings} servings
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Ingredients */}
              <Card className="p-6 h-fit lg:sticky lg:top-24">
                <h2 className="text-xl font-bold mb-4 text-center">Ingredients 🛒</h2>
                
                {/* Servings Adjuster */}
                <div className="flex items-center justify-center gap-4 mb-6 p-3 bg-muted/50 rounded-xl">
                  <span className="text-sm font-medium text-muted-foreground">Servings:</span>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8 rounded-full"
                      onClick={() => adjustServings(-1)}
                      disabled={currentServings <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-lg font-bold w-8 text-center">{currentServings}</span>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8 rounded-full"
                      onClick={() => adjustServings(1)}
                      disabled={currentServings >= 20}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {currentServings !== selectedRecipe.servings && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTargetServings(selectedRecipe.servings)}
                      className="text-xs text-muted-foreground"
                    >
                      Reset
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  {scaledIngredients.map((ingredient, index) => (
                    <div 
                      key={index}
                      className="flex items-center p-3 bg-muted/50 rounded-xl"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center mr-3 text-sm">
                        {index + 1}
                      </div>
                      <span className="font-medium">
                        {ingredient.quantity && `${ingredient.quantity} `}
                        {ingredient.unit && `${ingredient.unit} `}
                        {ingredient.ingredient}
                        {ingredient.notes && ` (${ingredient.notes})`}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Instructions */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold mb-4 text-center">Instructions 👨‍🍳</h2>
                {instructions.length > 0 ? (
                  <>
                    {instructions.map((instruction, index) => (
                      <Card 
                        key={index}
                        className={`p-5 cursor-pointer transition-all duration-300 ${
                          completedSteps.includes(index) 
                            ? 'bg-primary/10 border-primary/50' 
                            : 'hover:shadow-md'
                        }`}
                        onClick={() => toggleStep(index)}
                      >
                        <div className="flex gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                            completedSteps.includes(index)
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {completedSteps.includes(index) ? (
                              <CheckCircle2 className="w-5 h-5" />
                            ) : (
                              index + 1
                            )}
                          </div>
                          <div className="flex-1">
                            <p className={`leading-relaxed ${
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
                      <Card className="p-6 bg-gradient-fun text-white text-center">
                        <h3 className="text-xl font-bold mb-2">🎉 Bon Appétit!</h3>
                        <p>Your {selectedRecipe.title} is ready to enjoy!</p>
                      </Card>
                    )}
                  </>
                ) : (
                  <Card className="p-6 text-center text-muted-foreground">
                    <p>No detailed instructions available.</p>
                    {selectedRecipe.url && (
                      <a href={selectedRecipe.url} target="_blank" rel="noopener noreferrer">
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
        ) : (
          <Card className="p-8 text-center max-w-xl mx-auto">
            <p className="text-muted-foreground">
              No meal planned for {DAY_NAMES[selectedDay]}.
            </p>
          </Card>
        )}
      </div>

      {/* Plan Next Week Nudge */}
      {!hasNextWeekPlan() && (
        <div className="fixed bottom-4 right-4">
          <Button
            onClick={() => navigate('/plan')}
            className="bg-gradient-fun text-white rounded-xl shadow-playful"
          >
            <CalendarPlus className="h-4 w-4 mr-2" />
            Plan Next Week
          </Button>
        </div>
      )}
    </div>
  );
}

function Header({ user, onSignOut }: { user: any; onSignOut: () => void }) {
  const navigate = useNavigate();
  
  return (
    <header className="bg-background shadow-sm sticky top-0 z-10">
      <div className="container py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChefHat className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">Cook Mode</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/plan')}>
              <Calendar className="h-4 w-4 mr-2" />
              Plan
            </Button>
            {user?.user_metadata?.avatar_url && (
              <img 
                src={user.user_metadata.avatar_url} 
                alt="Profile"
                className="h-8 w-8 rounded-full"
              />
            )}
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
