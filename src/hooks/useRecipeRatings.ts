import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface RecipeRating {
  id: string;
  recipe_id: string;
  family_member_id: string | null;
  rating: number;
  created_at: string;
  updated_at: string;
}

export function useRecipeRatings(recipeId?: string) {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<RecipeRating[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRatings = useCallback(async () => {
    if (!user || !recipeId) {
      setRatings([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('recipe_ratings')
        .select('*')
        .eq('recipe_id', recipeId);

      if (error) throw error;
      setRatings(data || []);
    } catch (error) {
      console.error('Error fetching ratings:', error);
    } finally {
      setLoading(false);
    }
  }, [user, recipeId]);

  useEffect(() => {
    fetchRatings();
  }, [fetchRatings]);

  const setRating = async (rating: number, familyMemberId: string | null = null) => {
    if (!user || !recipeId) throw new Error('Must be logged in with a recipe');

    // Check if rating exists
    const existing = ratings.find(r => 
      r.family_member_id === familyMemberId
    );

    if (existing) {
      // Update existing rating
      const { data, error } = await supabase
        .from('recipe_ratings')
        .update({ rating })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      setRatings(prev => prev.map(r => r.id === existing.id ? data : r));
      return data;
    } else {
      // Create new rating
      const { data, error } = await supabase
        .from('recipe_ratings')
        .insert({
          user_id: user.id,
          recipe_id: recipeId,
          family_member_id: familyMemberId,
          rating,
        })
        .select()
        .single();

      if (error) throw error;
      setRatings(prev => [...prev, data]);
      return data;
    }
  };

  const deleteRating = async (familyMemberId: string | null = null) => {
    if (!user || !recipeId) throw new Error('Must be logged in with a recipe');

    const existing = ratings.find(r => r.family_member_id === familyMemberId);
    if (!existing) return;

    const { error } = await supabase
      .from('recipe_ratings')
      .delete()
      .eq('id', existing.id);

    if (error) throw error;
    setRatings(prev => prev.filter(r => r.id !== existing.id));
  };

  const getRatingForMember = (familyMemberId: string | null): number | null => {
    const rating = ratings.find(r => r.family_member_id === familyMemberId);
    return rating?.rating ?? null;
  };

  const getAverageRating = (): number | null => {
    if (ratings.length === 0) return null;
    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    return sum / ratings.length;
  };

  return {
    ratings,
    loading,
    setRating,
    deleteRating,
    getRatingForMember,
    getAverageRating,
    refreshRatings: fetchRatings,
  };
}
