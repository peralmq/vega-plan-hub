import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  ChefHat,
  LogOut,
  Undo2,
  Package,
  User,
  PartyPopper,
  MessageCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useBatchPool, type PoolMeal } from "@/hooks/useBatchPool";
import { convertIngredientToMetric } from "@/lib/ingredientNormalization";
import { toISODate, partitionPool, groupPoolByRecipe } from "@/lib/planPool";
import { RecipeRatings } from "@/components/recipe/RecipeRatings";
import { RecipeComments } from "@/components/recipe/RecipeComments";
import { toast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CompassionFooter } from "@/components/CompassionFooter";
import { findDeepLinkRecipe, resolveServingsMultiplier } from "@/lib/cookModeDeepLink";

export default function CookMode() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { currentBatch, loading, allRecipes, cookPoolEntry, uncookPoolEntry } = useBatchPool();

  const [searchParams, setSearchParams] = useSearchParams();
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [targetServings, setTargetServings] = useState<number | null>(null);
  const [viewEntryId, setViewEntryId] = useState<string | null>(null);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [deepLinkNotified, setDeepLinkNotified] = useState(false);
  const deepLinkAppliedRef = useRef(false);

  const todayIso = toISODate(new Date());
  const pool = useMemo(() => currentBatch?.meals ?? [], [currentBatch]);
  const partition = useMemo(() => partitionPool(pool), [pool]);
  const groups = useMemo(() => groupPoolByRecipe(pool), [pool]);
  const groupCount = (recipeId: string) =>
    groups.find((g) => g.recipeId === recipeId)?.count ?? 1;

  const cookedTodayEntry = partition.cooked.find((e) => e.cookedOn === todayIso);
  const viewedEntry = viewEntryId ? pool.find((e) => e.id === viewEntryId) : undefined;
  const selectedPoolEntry: PoolMeal | undefined = viewedEntry ?? cookedTodayEntry;

  // p4-11: `?recipe=<markdown recipe id>` deep-links straight to a recipe,
  // bypassing the pool picker entirely — an unknown id falls back to the
  // normal picker view plus a friendly toast (design.spec.md, Cook Mode).
  const deepLinkRecipeId = searchParams.get('recipe');
  const deepLinkRecipe = useMemo(
    () => findDeepLinkRecipe(allRecipes, deepLinkRecipeId),
    [allRecipes, deepLinkRecipeId],
  );
  // `?scale=<multiplier>`: absent/bad -> the recipe's own multiplier in the
  // active batch's pool when it's in there, else 1.
  const deepLinkMultiplier = useMemo(() => {
    const plannedMultiplier = deepLinkRecipe
      ? pool.find(m => m.recipeId === deepLinkRecipe.id)?.servingsMultiplier
      : undefined;
    return resolveServingsMultiplier(searchParams.get('scale'), plannedMultiplier ?? 1);
  }, [deepLinkRecipe, searchParams, pool]);

  const selectedRecipe = deepLinkRecipe ?? selectedPoolEntry?.recipe;

  // Unknown ?recipe id: friendly toast, never a crash — falls through to the
  // normal pool picker.
  useEffect(() => {
    if (!deepLinkRecipeId || deepLinkRecipe || deepLinkNotified) return;
    toast({
      title: "🤷 Couldn't find that recipe",
      description: `"${deepLinkRecipeId}" isn't in the recipe box — showing Cook Mode instead.`,
    });
    setDeepLinkNotified(true);
  }, [deepLinkRecipeId, deepLinkRecipe, deepLinkNotified]);

  useEffect(() => {
    setCompletedSteps([]);
    setTargetServings(null);
  }, [selectedRecipe?.id]);

  useMemo(() => {
    if (selectedRecipe && targetServings === null && !deepLinkRecipe && selectedPoolEntry) {
      setTargetServings(Math.round(selectedRecipe.servings * selectedPoolEntry.servingsMultiplier));
    } else if (selectedRecipe && targetServings === null && !selectedPoolEntry) {
      setTargetServings(selectedRecipe.servings);
    }
  }, [selectedRecipe, targetServings, deepLinkRecipe, selectedPoolEntry]);

  // Once the plan finishes loading (so the default × reflects real pool
  // data, not a mid-fetch null), apply the deep link's servings once. A ref
  // guard keeps this from re-firing and stomping a manual +/- adjustment
  // when the pool refetches for an unrelated reason.
  useEffect(() => {
    if (loading || !deepLinkRecipe || deepLinkAppliedRef.current) return;
    deepLinkAppliedRef.current = true;
    setTargetServings(Math.round(deepLinkRecipe.servings * deepLinkMultiplier));
  }, [loading, deepLinkRecipe, deepLinkMultiplier]);

  // Keep the URL shareable while deep-linked: +/- adjustments write the
  // current multiplier back to `?scale=` (replace, not push — the stepper
  // must not pollute browser history). Only active when a `?recipe` deep
  // link is what's being viewed, so pool picks don't masquerade as links.
  useEffect(() => {
    // Wait for the apply effect above: before it runs, targetServings holds
    // an interim default that must not clobber the link's own ?scale.
    if (!deepLinkRecipe || !targetServings || !deepLinkAppliedRef.current) return;
    const multiplier =
      Math.round((targetServings / deepLinkRecipe.servings) * 100) / 100;
    const next = new URLSearchParams(searchParams);
    next.set('scale', String(multiplier));
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [deepLinkRecipe, targetServings, searchParams, setSearchParams]);

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

  const handlePick = async (entry: PoolMeal) => {
    setBusyEntryId(entry.id);
    try {
      await cookPoolEntry(entry.id);
      setViewEntryId(entry.id);
      toast({
        title: "Tonight's pick! 🍳",
        description: `${entry.recipe?.title ?? entry.recipeId} is on the menu.`,
      });
    } catch {
      toast({ title: "Couldn't save your pick", variant: "destructive" });
    } finally {
      setBusyEntryId(null);
    }
  };

  const handleUndo = async () => {
    if (!selectedPoolEntry) return;
    setBusyEntryId(selectedPoolEntry.id);
    try {
      await uncookPoolEntry(selectedPoolEntry.id);
      setViewEntryId(null);
      toast({ title: "Undone — back to the pool 🔄" });
    } catch {
      toast({ title: "Couldn't undo", variant: "destructive" });
    } finally {
      setBusyEntryId(null);
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

  if (!currentBatch && !deepLinkRecipe) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header user={user} onSignOut={handleSignOut} />

        <div className="container py-20">
          <div className="max-w-xl mx-auto text-center">
            <Card className="p-8 border-2 border-dashed border-primary/20">
              <ChefHat className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
              <h2 className="text-2xl font-bold mb-4">No active batch yet</h2>
              <p className="text-muted-foreground mb-6 flex items-center justify-center gap-1 flex-wrap">
                No active batch — plan one in chat <MessageCircle className="h-4 w-4 inline" /> 💬
              </p>
            </Card>
          </div>
        </div>
        <CompassionFooter />
      </div>
    );
  }

  const currentServings = targetServings || selectedRecipe?.servings || 4;
  const instructions = selectedRecipe?.instructions || [];
  const canUndo = !deepLinkRecipe && selectedPoolEntry?.cookedOn === todayIso;

  const difficultyColors: Record<string, string> = {
    Easy: "bg-accent text-accent-foreground",
    Medium: "bg-secondary text-secondary-foreground",
    Hard: "bg-foreground text-background"
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header user={user} onSignOut={handleSignOut} />

      <div className="container py-6">
        {currentBatch && (
          <BatchOverview
            startsOn={currentBatch.startsOn}
            endsOn={currentBatch.endsOn}
            cookedCount={partition.cooked.length}
            totalCount={pool.length}
          />
        )}

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
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant="secondary">
                      {deepLinkRecipe ? '🔗 Direct link' : "Tonight's Dinner"}
                    </Badge>
                    {!deepLinkRecipe && groupCount(selectedRecipe.id) > 1 && (
                      <Badge variant="secondary">🍱 ×{groupCount(selectedRecipe.id)}</Badge>
                    )}
                  </div>
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
                    <Badge className="bg-black/20 text-white border-0 rounded-lg px-3 py-1">
                      🐮💚 zero animals harmed
                    </Badge>
                  </div>
                </div>
              </div>
              {canUndo && (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={handleUndo} disabled={busyEntryId === selectedPoolEntry?.id}>
                    <Undo2 className="h-4 w-4 mr-2" />
                    Not tonight after all — undo
                  </Button>
                </div>
              )}
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
                      aria-label="Decrease servings"
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
                      aria-label="Increase servings"
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
                      <Card className="p-6 bg-primary text-primary-foreground text-center">
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
        ) : partition.remaining.length > 0 ? (
          <PoolPicker
            entries={partition.remaining}
            groupCount={groupCount}
            busyEntryId={busyEntryId}
            onPick={handlePick}
          />
        ) : (
          <Card className="p-8 text-center max-w-xl mx-auto">
            <PartyPopper className="h-12 w-12 mx-auto text-primary mb-4" />
            <h2 className="text-xl font-bold mb-2">Everything's cooked! 🎉</h2>
            <p className="text-muted-foreground mb-4">
              The whole batch is done. Plan the next one in chat 💬, or peek at what you made:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {partition.cooked.map(entry => (
                <Card
                  key={entry.id}
                  className="p-3 cursor-pointer hover:border-primary transition-colors"
                  onClick={() => setViewEntryId(entry.id)}
                >
                  {entry.recipe?.image && (
                    <img src={entry.recipe.image} alt={entry.recipe.title} className="w-full h-16 object-cover rounded-lg mb-2" />
                  )}
                  <div className="text-xs font-medium truncate">{entry.recipe?.title ?? entry.recipeId}</div>
                </Card>
              ))}
            </div>
          </Card>
        )}
      </div>
      <CompassionFooter />
    </div>
  );
}

function BatchOverview({
  startsOn,
  endsOn,
  cookedCount,
  totalCount,
}: {
  startsOn: string;
  endsOn: string;
  cookedCount: number;
  totalCount: number;
}) {
  const navigate = useNavigate();
  return (
    <Card className="p-3 mb-6 flex items-center justify-between gap-3 flex-wrap bg-muted/50 border-dashed">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Package className="h-4 w-4 text-primary" />
        <span>
          Batch {startsOn} → {endsOn} · {cookedCount}/{totalCount} cooked
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/plan')}>
        Edit pool
      </Button>
    </Card>
  );
}

function PoolPicker({
  entries,
  groupCount,
  busyEntryId,
  onPick,
}: {
  entries: PoolMeal[];
  groupCount: (recipeId: string) => number;
  busyEntryId: string | null;
  onPick: (entry: PoolMeal) => void;
}) {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-bold mb-4 text-center">What's for dinner tonight? 🍽️</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {entries.map(entry => (
          <Card
            key={entry.id}
            className="p-3 cursor-pointer transition-colors border border-dashed hover:border-primary"
            onClick={() => onPick(entry)}
          >
            {entry.recipe?.image && (
              <img
                src={entry.recipe.image}
                alt={entry.recipe.title}
                className="w-full h-24 object-cover rounded-lg mb-2"
              />
            )}
            <div className="flex items-start justify-between gap-1">
              <h4 className="font-bold text-sm truncate">{entry.recipe?.title ?? entry.recipeId}</h4>
              {groupCount(entry.recipeId) > 1 && (
                <Badge variant="secondary" className="text-xs shrink-0">🍱 ×{groupCount(entry.recipeId)}</Badge>
              )}
            </div>
            {entry.recipe && (
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {entry.recipe.cookTime}min
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {Math.round(entry.recipe.servings * entry.servingsMultiplier)}
                </span>
              </div>
            )}
            <Button
              size="sm"
              className="w-full mt-3 bg-primary text-primary-foreground rounded-full"
              disabled={busyEntryId === entry.id}
              onClick={(e) => { e.stopPropagation(); onPick(entry); }}
            >
              Cook this 🍳
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Header({ user, onSignOut }: { user: SupabaseUser; onSignOut: () => void }) {
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
              <Package className="h-4 w-4 mr-2" />
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
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
