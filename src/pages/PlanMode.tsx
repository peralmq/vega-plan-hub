import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChefHat,
  LogOut,
  Plus,
  X,
  ArrowRight,
  Clock,
  Users,
  Minus,
  User,
  MessageCircle,
  ShoppingCart,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBatchPool, type PoolMeal } from "@/hooks/useBatchPool";
import { ParsedRecipe } from "@/services/recipeLoader";
import { groupPoolByRecipe, planStorkokToggle } from "@/lib/planPool";
import { toast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CompassionFooter } from "@/components/CompassionFooter";
import { RecipeImage } from "@/components/recipe/RecipeImage";

const MIN_MULTIPLIER = 0.5;
const MAX_MULTIPLIER = 4;

export default function PlanMode() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const {
    currentBatch,
    loading,
    allRecipes,
    addPoolEntry,
    updatePoolEntryMultiplier,
    removePoolEntry,
  } = useBatchPool();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pool = useMemo(() => currentBatch?.meals ?? [], [currentBatch]);
  const groups = useMemo(() => groupPoolByRecipe(pool), [pool]);
  const groupCount = (recipeId: string) =>
    groups.find(g => g.recipeId === recipeId)?.count ?? 1;

  const totalCookTime = pool.reduce((sum, m) => sum + (m.recipe?.cookTime ?? 0), 0);

  const handleAdd = async (recipe: ParsedRecipe) => {
    setPickerOpen(false);
    try {
      await addPoolEntry(recipe.id, 1);
      toast({ title: "Added to the pool! ✨", description: recipe.title });
    } catch {
      toast({ title: "Couldn't add that dish", variant: "destructive" });
    }
  };

  const handleRemove = async (entry: PoolMeal) => {
    setBusyId(entry.id);
    try {
      await removePoolEntry(entry.id);
    } catch {
      toast({ title: "Couldn't remove that dish", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  // 🍱 Storkok = the same dish twice in the pool (cook once, eat twice) —
  // the meal-prep pair the badge already renders, and the same semantics the
  // chat bot uses. Not the servings multiplier: that stays family-size.
  const handleStorkok = async (entry: PoolMeal) => {
    const plan = planStorkokToggle(pool, entry.recipeId);
    if (!plan) return;
    setBusyId(entry.id);
    try {
      if (plan.action === "add") {
        await addPoolEntry(plan.recipeId, plan.servingsMultiplier);
        toast({ title: "Storkok! 🍱", description: entry.recipe?.title });
      } else {
        await removePoolEntry(plan.entryId);
      }
    } catch {
      toast({ title: "Couldn't change storkok", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleAdjust = async (entry: PoolMeal, delta: number) => {
    const next = Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, entry.servingsMultiplier + delta));
    if (next === entry.servingsMultiplier) return;
    setBusyId(entry.id);
    try {
      await updatePoolEntryMultiplier(entry.id, next);
    } catch {
      toast({ title: "Couldn't update servings", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background shadow-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-6 w-6 text-primary" />
              <div>
                <span className="text-lg font-bold">Plan Mode</span>
                {currentBatch && (
                  <span className="text-sm text-muted-foreground ml-2">
                    started {currentBatch.startsOn}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <ChefHat className="h-4 w-4 mr-2" />
                Cook
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/account')}>
                {user?.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="Profile" className="h-6 w-6 rounded-full" />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </Button>
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-6">
        {!currentBatch ? (
          <div className="max-w-xl mx-auto text-center">
            <Card className="p-8 border-2 border-dashed border-primary/20">
              <ShoppingCart className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
              <h2 className="text-2xl font-bold mb-4">No active batch yet</h2>
              <p className="text-muted-foreground flex items-center justify-center gap-1 flex-wrap">
                No active batch — plan one in chat <MessageCircle className="h-4 w-4 inline" /> 💬
              </p>
            </Card>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div className="flex gap-4 flex-wrap">
                <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
                  {pool.length} dish{pool.length !== 1 ? 'es' : ''} in the pool
                </Badge>
                <Badge variant="outline">
                  ⏱️ {totalCookTime} min total
                </Badge>
              </div>
              <Button size="sm" onClick={() => setPickerOpen(true)} className="bg-primary text-primary-foreground rounded-full">
                <Plus className="h-4 w-4 mr-2" />
                Add a dish
              </Button>
            </div>

            {/* Pool list */}
            {pool.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground border-2 border-dashed">
                The pool is empty. Add a dish to get started! ✨
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {pool.map(entry => (
                  <PoolCard
                    key={entry.id}
                    entry={entry}
                    badgeCount={groupCount(entry.recipeId)}
                    busy={busyId === entry.id}
                    onAdjust={(delta) => handleAdjust(entry, delta)}
                    onRemove={() => handleRemove(entry)}
                    onStorkok={() => handleStorkok(entry)}
                  />
                ))}
              </div>
            )}

            <div className="text-center">
              <Button
                size="lg"
                onClick={() => navigate('/summary')}
                disabled={pool.length === 0}
                className="bg-primary text-primary-foreground rounded-full transition-colors px-8"
              >
                View Shopping List
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Recipe Picker Modal */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a dish to the pool</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {allRecipes.map(recipe => (
              <Card
                key={recipe.id}
                className="p-3 cursor-pointer transition-colors border border-dashed hover:border-primary"
                onClick={() => handleAdd(recipe)}
              >
                <RecipeImage
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
                <div className="flex flex-wrap gap-1 mt-2">
                  {recipe.tags.slice(0, 2).map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs px-2 py-0">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <CompassionFooter />
    </div>
  );
}

function PoolCard({
  entry,
  badgeCount,
  busy,
  onAdjust,
  onRemove,
  onStorkok,
}: {
  entry: PoolMeal;
  badgeCount: number;
  busy: boolean;
  onAdjust: (delta: number) => void;
  onRemove: () => void;
  onStorkok: () => void;
}) {
  const recipe = entry.recipe;
  const cooked = entry.cookedOn !== null;

  return (
    <Card className={`p-4 border-2 border-dashed transition-all relative group ${cooked ? 'opacity-70' : 'hover:border-primary/30'}`}>
      <div className="bg-foreground text-background rounded-xl overflow-hidden">
        {recipe?.image && (
          <RecipeImage src={recipe.image} alt={recipe.title} className="w-full h-20 object-cover opacity-80" />
        )}
        <div className="p-3">
          <div className="flex items-center gap-2">
            <div className="font-bold text-sm truncate flex-1">{recipe?.title ?? entry.recipeId}</div>
            {badgeCount > 1 && (
              <Badge variant="secondary" className="text-xs shrink-0">🍱 ×{badgeCount}</Badge>
            )}
          </div>
          {recipe && (
            <div className="text-xs text-white/70 mt-1">
              ⏱️ {recipe.cookTime}min
            </div>
          )}
          {cooked ? (
            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-white/20 text-xs text-white/80">
              <CheckCircle2 className="h-3 w-3" /> Cooked {entry.cookedOn}
            </div>
          ) : (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/20">
              <span className="text-xs text-white/80">
                <Users className="h-3 w-3 inline mr-1" />
                {recipe ? Math.round(recipe.servings * entry.servingsMultiplier) : ''}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Decrease servings"
                  className="h-5 w-5 text-white hover:bg-white/20"
                  onClick={() => onAdjust(-0.5)}
                  disabled={busy || entry.servingsMultiplier <= MIN_MULTIPLIER}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="text-xs font-medium w-6 text-center">
                  {entry.servingsMultiplier}×
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Increase servings"
                  className="h-5 w-5 text-white hover:bg-white/20"
                  onClick={() => onAdjust(0.5)}
                  disabled={busy || entry.servingsMultiplier >= MAX_MULTIPLIER}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
          {!cooked && (
            <button
              type="button"
              aria-label={badgeCount > 1 ? "Undo storkok" : "Make it storkok"}
              aria-pressed={badgeCount > 1}
              onClick={onStorkok}
              disabled={busy}
              className={`mt-2 w-full rounded-full border px-3 py-1 text-xs transition-colors ${
                badgeCount > 1
                  ? "border-background bg-background text-foreground"
                  : "border-white/40 text-white/90 hover:bg-white/15"
              }`}
            >
              🍱 Storkok
            </button>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Remove from pool"
        onClick={onRemove}
        disabled={busy}
        className="absolute -top-2 -right-2 h-6 w-6 p-0 bg-destructive hover:bg-destructive/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="h-3 w-3" />
      </Button>
    </Card>
  );
}
