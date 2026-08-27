import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { loadAllRecipes, ParsedRecipe } from '@/services/recipeLoader';
import {
  toISODate,
  findCurrentBatch,
  findNextBatch,
  rowsToPoolEntries,
  type BatchRowLike,
  type PoolEntryRowLike,
  type PoolEntry,
} from '@/lib/planPool';

export interface PoolMeal extends PoolEntry {
  recipe?: ParsedRecipe;
}

export interface BatchPool {
  id: string;
  startsOn: string;
  endsOn: string;
  meals: PoolMeal[];
}

// p4-12: the web app reads the pool model (plan_batches + planned_meals as
// batch pool entries, tech.spec.md "Pool model") instead of the legacy
// meal_plans/daily_meals weekly tables. "Active batch" mirrors the old
// current/next-week window: the batch whose range covers today, plus the
// soonest upcoming one — both stateless re-derivations from the DB, never
// locally cached beyond this hook's state. This plan does not add a
// web-side lock flow (p4-03 owns creating plan_batches rows from chat) —
// pool mutations here only ever touch an *existing* batch's entries.
export function useBatchPool() {
  const { user } = useAuth();
  const [currentBatch, setCurrentBatch] = useState<BatchPool | null>(null);
  const [nextBatch, setNextBatch] = useState<BatchPool | null>(null);
  const [loading, setLoading] = useState(true);
  const [allRecipes] = useState<ParsedRecipe[]>(() => loadAllRecipes());

  const fetchPool = useCallback(async () => {
    if (!user) {
      setCurrentBatch(null);
      setNextBatch(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const today = toISODate(new Date());

      const { data: batchRows, error: batchError } = await supabase
        .from('plan_batches')
        .select('id, starts_on, ends_on')
        .gte('ends_on', today)
        .order('starts_on', { ascending: true });
      if (batchError) throw batchError;

      const batches = (batchRows ?? []) as BatchRowLike[];
      const current = findCurrentBatch(batches, today);
      const next = findNextBatch(batches, today, current?.id);
      const batchIds = [current?.id, next?.id].filter(
        (id): id is string => !!id,
      );

      let entryRows: PoolEntryRowLike[] = [];
      if (batchIds.length > 0) {
        const { data, error } = await supabase
          .from('planned_meals')
          .select('id, batch_id, recipe_id, servings_multiplier, cooked_on')
          .in('batch_id', batchIds);
        if (error) throw error;
        entryRows = (data ?? []) as (PoolEntryRowLike & { batch_id: string })[];
      }

      const toBatchPool = (batch: BatchRowLike | null): BatchPool | null => {
        if (!batch) return null;
        const rows = entryRows.filter(
          (r) => (r as PoolEntryRowLike & { batch_id: string }).batch_id === batch.id,
        );
        const meals = rowsToPoolEntries(rows).map((entry) => ({
          ...entry,
          recipe: allRecipes.find((r) => r.id === entry.recipeId),
        }));
        return { id: batch.id, startsOn: batch.starts_on, endsOn: batch.ends_on, meals };
      };

      setCurrentBatch(toBatchPool(current));
      setNextBatch(toBatchPool(next));
    } catch (error) {
      console.error('Error fetching batch pool:', error);
    } finally {
      setLoading(false);
    }
  }, [user, allRecipes]);

  useEffect(() => {
    fetchPool();
  }, [fetchPool]);

  // Add a dish to the active batch's pool. Adding the same recipeId again is
  // how a meal-prep pair is made (two independent rows, each its own
  // multiplier) — no special-casing needed.
  const addPoolEntry = async (recipeId: string, servingsMultiplier = 1) => {
    if (!user) throw new Error('Must be logged in');
    if (!currentBatch) throw new Error('No active batch to add to');

    const { error } = await supabase.from('planned_meals').insert({
      user_id: user.id,
      batch_id: currentBatch.id,
      recipe_id: recipeId,
      servings_multiplier: servingsMultiplier,
    });
    if (error) throw error;
    await fetchPool();
  };

  const updatePoolEntryMultiplier = async (entryId: string, servingsMultiplier: number) => {
    const { error } = await supabase
      .from('planned_meals')
      .update({ servings_multiplier: servingsMultiplier })
      .eq('id', entryId);
    if (error) throw error;
    await fetchPool();
  };

  const removePoolEntry = async (entryId: string) => {
    const { error } = await supabase.from('planned_meals').delete().eq('id', entryId);
    if (error) throw error;
    await fetchPool();
  };

  // Picking a dish from the remaining pool stamps cooked_on (design.spec.md,
  // Cook Mode). Un-picking is allowed same-day only (mistake recovery) —
  // enforced by the caller, which only shows the undo action for an entry
  // cooked today.
  const cookPoolEntry = async (entryId: string) => {
    const { error } = await supabase
      .from('planned_meals')
      .update({ cooked_on: toISODate(new Date()) })
      .eq('id', entryId);
    if (error) throw error;
    await fetchPool();
  };

  const uncookPoolEntry = async (entryId: string) => {
    const { error } = await supabase
      .from('planned_meals')
      .update({ cooked_on: null })
      .eq('id', entryId);
    if (error) throw error;
    await fetchPool();
  };

  return {
    currentBatch,
    nextBatch,
    loading,
    allRecipes,
    addPoolEntry,
    updatePoolEntryMultiplier,
    removePoolEntry,
    cookPoolEntry,
    uncookPoolEntry,
    refreshPool: fetchPool,
  };
}
