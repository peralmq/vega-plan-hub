import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  currentPreferenceMap,
  ProductPreferenceRowLike,
} from '@/lib/productPreferences';

// Read path only (p4-01): the current product preferences as a
// canonical-ingredient → product-name map. Rows are written by the p4-04
// learning flows (and by hand until then); the table shipping empty makes
// this a cheap no-op.
export function useProductPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!user) {
      setPreferences(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('product_preferences')
        .select('canonical_ingredient, product_name, superseded_by, valid_from')
        .is('superseded_by', null);
      if (error) {
        console.error('Error fetching product preferences:', error);
        return;
      }
      if (!cancelled) {
        setPreferences(currentPreferenceMap((data ?? []) as ProductPreferenceRowLike[]));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { preferences };
}
