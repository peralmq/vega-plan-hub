import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  planSupersede,
  planUndo,
  type PreferenceRow,
} from '@/lib/productPreferences';

// The "what the bot believes" admin page (p4-04, Account.tsx): full history
// per ingredient, with the write paths Steps 4 asks for — inline edit
// (creates a superseding row, source='explicit') and delete (retires the
// current row with nothing to replace it — planUndo(current, null), never a
// real DELETE: the store stays append-only, r4 §1). This is a SEPARATE hook
// from useProductPreferences (the read-only canonical->product map the
// shopping list resolves against) because the admin page needs row ids and
// full history, which that map deliberately throws away.

export interface PreferenceGroup {
  canonicalIngredient: string;
  current: PreferenceRow;
  // Older rows for this ingredient, newest first, excluding `current`.
  history: PreferenceRow[];
}

const COLUMNS = 'id, canonical_ingredient, product_name, superseded_by, valid_from, source, note';

function groupByIngredient(rows: PreferenceRow[]): PreferenceGroup[] {
  const byIngredient = new Map<string, PreferenceRow[]>();
  for (const row of rows) {
    const list = byIngredient.get(row.canonical_ingredient) ?? [];
    list.push(row);
    byIngredient.set(row.canonical_ingredient, list);
  }
  const groups: PreferenceGroup[] = [];
  for (const [canonicalIngredient, group] of byIngredient) {
    // A fully-retired ingredient (every row superseded — the delete path)
    // has no current belief, so it drops off "what the bot believes" —
    // the rows themselves are untouched in the DB, just not shown.
    const current = group.find((r) => r.superseded_by === null);
    if (!current) continue;
    groups.push({
      canonicalIngredient,
      current,
      history: group.filter((r) => r.id !== current.id),
    });
  }
  return groups.sort((a, b) => a.canonicalIngredient.localeCompare(b.canonicalIngredient));
}

export function usePreferenceAdmin() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<PreferenceGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_preferences')
        .select(COLUMNS)
        .eq('user_id', user.id)
        .order('valid_from', { ascending: false });
      if (error) throw error;
      setGroups(groupByIngredient((data ?? []) as PreferenceRow[]));
    } catch (error) {
      console.error('Error fetching product preferences:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Inline edit: a new current row superseding the one shown, source
  // explicit (a human typed it into the admin page — the same tag an
  // explicit chat switch gets).
  const editPreference = useCallback(
    async (current: PreferenceRow, newProductName: string) => {
      if (!user) throw new Error('Must be logged in');
      const trimmed = newProductName.trim();
      if (!trimmed || trimmed === current.product_name) return;

      const plan = planSupersede([current], current.canonical_ingredient, trimmed, 'explicit');
      const { data, error } = await supabase
        .from('product_preferences')
        .insert({ user_id: user.id, ...plan.insert })
        .select('id')
        .single();
      if (error) throw error;
      const newId = (data as { id: string }).id;

      const { error: supersedeError } = await supabase
        .from('product_preferences')
        .update({ superseded_by: newId })
        .eq('id', current.id);
      if (supersedeError) throw supersedeError;
      await refresh();
    },
    [user, refresh],
  );

  // Delete: retire the current row with nothing to replace it — the
  // ingredient goes back to unmatched until someone teaches it again. The
  // row itself is never removed (append-only), just no longer current.
  const deletePreference = useCallback(
    async (current: PreferenceRow) => {
      if (!user) throw new Error('Must be logged in');
      const plan = planUndo(current.id, null);
      const { error } = await supabase
        .from('product_preferences')
        .update({ superseded_by: plan.retireSupersededBy })
        .eq('id', plan.retireId);
      if (error) throw error;
      await refresh();
    },
    [user, refresh],
  );

  return { groups, loading, editPreference, deletePreference, refresh };
}
