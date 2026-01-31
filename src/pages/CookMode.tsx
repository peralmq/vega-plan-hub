import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  ArrowRight,
  User,
  Edit2
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMealPlanDB } from "@/hooks/useMealPlanDB";
import { convertIngredientToMetric } from "@/lib/ingredientNormalization";
import { ParsedRecipe, loadAllRecipes } from "@/services/recipeLoader";
import { RecipeRatings } from "@/components/recipe/RecipeRatings";
import { RecipeComments } from "@/components/recipe/RecipeComments";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function CookMode() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { 
    currentWeekPlan, 
    nextWeekPlan,
    loading, 
    hasCurrentWeekPlan, 
    hasNextWeekPlan,
    getRemainingMeals,
    getRecipeForDay,
    getTodayIndex,
    getCurrentMonday,
    saveCurrentWeekPlan,
    saveNextWeekPlan,
  } = useMealPlanDB();

  const allRecipes = useMemo(() => loadAllRecipes(), []);
  const todayIndex = getTodayIndex();
  
  const [selectedDay, setSelectedDay] = useState<number>(todayIndex);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [targetServings, setTargetServings] = useState<number | null>(null);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [viewingWeek, setViewingWeek] = useState<'current' | 'next'>('current');

  const activePlan = viewingWeek === 'current' ? currentWeekPlan : nextWeekPlan;

  const selectedRecipe = viewingWeek === 'current' 
    ? getRecipeForDay(selectedDay) 
    : activePlan?.meals.find(m => m.dayOfWeek === selectedDay)?.recipe;

  const usedRecipeIds = new Set(activePlan?.meals.map(m => m.recipeId) || []);

  useMemo(() => {
    if (selectedRecipe && targetServings === null) {
      setTargetServings(selectedRecipe.servings);
    }
  }, [selectedRecipe, targetServings]);

  useMemo(() => {
    setCompletedSteps([]);
    setTargetServings(selectedRecipe?.servings || null);
  }, [selectedDay]);

  const scaledIngredients = useMemo(() => {
    if (!selectedRecipe || !targetServings) return [];
    const scaleFactor = targetServings / selectedRecipe.servings;
    
    return selectedRecipe.ingredients.map(ing => {
      const originalQty = parseFloat(ing.quantity) || 0;
      const scaledQty = originalQty * scaleFactor;
      const scaledIng = {
        ...ing,
        quantity: scaledQty > 0 ? scaledQty.toString() : ing.quantity,
      };
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

  const handleChangeMeal = async (recipe: ParsedRecipe) => {
    if (editingDay === null || !activePlan) return;
    
    try {
      const mealsMap = new Map<number, { recipeId: string; servingsMultiplier: number }>();
      activePlan.meals.forEach(meal => {
        if (meal.dayOfWeek !== editingDay) {
          mealsMap.set(meal.dayOfWeek, { 
            recipeId: meal.recipeId, 
            servingsMultiplier: meal.servingsMultiplier 
          });
        }
      });
      mealsMap.set(editingDay, { recipeId: recipe.id, servingsMultiplier: 1.0 });

      if (viewingWeek === 'current') {
        await saveCurrentWeekPlan(mealsMap);
      } else {
        await saveNextWeekPlan(mealsMap);
      }

      toast({
        title: "Meal updated! 🍽️",
        description: `${DAY_NAMES[editingDay]}: ${recipe.title}`,
      });
      setEditingDay(null);
    } catch (error) {
      toast({
        title: "Error updating meal",
        variant: "destructive",
      });
    }
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

  if (!hasCurrentWeekPlan()) {
    const remainingDays = 7 - todayIndex;
    
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

  const difficultyColors: Record<string, string> = {
    Easy: "bg-gradient-fresh text-primary-foreground",
    Medium: "bg-gradient-warm text-primary-foreground", 
    Hard: "bg-gradient-fun text-primary-foreground"
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header user={user} onSignOut={handleSignOut} />

      <div className="container py-6">
        {/* Week Toggle */}
        {hasNextWeekPlan() && (
          <div className="flex gap-2 mb-4">
            <Button
              variant={viewingWeek === 'current' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setViewingWeek('current'); setSelectedDay(todayIndex); }}
            >
              This Week
            </Button>
            <Button
              variant={viewingWeek === 'next' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setViewingWeek('next'); setSelectedDay(0); }}
            >
              Next Week
            </Button>
          </div>
        )}

        {/* Day Selector */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {viewingWeek === 'current' ? "This Week's Meals" : "Next Week's Meals"}
            </h2>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {DAY_NAMES.map((day, index) => {
              const meal = activePlan?.meals.find(m => m.dayOfWeek === index);
              const isToday = viewingWeek === 'current' && index === todayIndex;
              const isSelected = index === selectedDay;
              const hasMeal = !!meal;

              return (
                <div key={day} className="flex-shrink-0 relative group">
                  <Button
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => hasMeal && setSelectedDay(index)}
                    disabled={!hasMeal}
                    className={`min-w-[80px] ${
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
                  {hasMeal && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute -top-1 -right-1 h-5 w-5 bg-background border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setEditingDay(index)}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
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
                    <Badge className={`${difficultyColors[selectedRecipe.difficulty] || ''} border-0 rounded-lg px-3 py-1`}>
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

                {/* Ratings & Comments */}
                <div className="space-y-4 mt-6">
                  <RecipeRatings recipeId={selectedRecipe.id} />
                  <RecipeComments recipeId={selectedRecipe.id} />
                </div>
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

      {/* Edit Meal Modal */}
      <Dialog open={editingDay !== null} onOpenChange={() => setEditingDay(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Change meal for {editingDay !== null ? DAY_NAMES[editingDay] : ''}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {allRecipes
              .filter(r => !usedRecipeIds.has(r.id) || (editingDay !== null && activePlan?.meals.find(m => m.dayOfWeek === editingDay)?.recipeId === r.id))
              .map(recipe => (
                <Card 
                  key={recipe.id}
                  className="p-3 cursor-pointer hover:shadow-playful transition-all hover:scale-[1.02] border-2 border-dashed hover:border-primary/50"
                  onClick={() => handleChangeMeal(recipe)}
                >
                  <img 
                    src={recipe.image} 
                    alt={recipe.title}
                    className="w-full h-24 object-cover rounded-lg mb-2"
                  />
                  <h4 className="font-bold text-sm truncate">{recipe.title}</h4>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {recipe.cookTime}min
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {recipe.servings}
                    </span>
                  </div>
                </Card>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan Next Week Nudge */}
      {!hasNextWeekPlan() && viewingWeek === 'current' && (
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
            <Button variant="ghost" size="sm" onClick={() => navigate('/account')}>
              {user?.user_metadata?.avatar_url ? (
                <img 
                  src={user.user_metadata.avatar_url} 
                  alt="Profile"
                  className="h-6 w-6 rounded-full"
                />
              ) : (
                <User className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
