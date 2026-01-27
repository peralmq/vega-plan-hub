import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface RecipeComment {
  id: string;
  recipe_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export function useRecipeComments(recipeId?: string) {
  const { user } = useAuth();
  const [comments, setComments] = useState<RecipeComment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    if (!user || !recipeId) {
      setComments([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('recipe_comments')
        .select('*')
        .eq('recipe_id', recipeId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  }, [user, recipeId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const addComment = async (content: string) => {
    if (!user || !recipeId) throw new Error('Must be logged in with a recipe');

    const { data, error } = await supabase
      .from('recipe_comments')
      .insert({
        user_id: user.id,
        recipe_id: recipeId,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) throw error;
    setComments(prev => [data, ...prev]);
    return data;
  };

  const updateComment = async (id: string, content: string) => {
    if (!user) throw new Error('Must be logged in');

    const { data, error } = await supabase
      .from('recipe_comments')
      .update({ content: content.trim() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    setComments(prev => prev.map(c => c.id === id ? data : c));
    return data;
  };

  const deleteComment = async (id: string) => {
    if (!user) throw new Error('Must be logged in');

    const { error } = await supabase
      .from('recipe_comments')
      .delete()
      .eq('id', id);

    if (error) throw error;
    setComments(prev => prev.filter(c => c.id !== id));
  };

  return {
    comments,
    loading,
    addComment,
    updateComment,
    deleteComment,
    refreshComments: fetchComments,
  };
}
