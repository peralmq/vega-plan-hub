import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface FamilyMember {
  id: string;
  name: string;
  avatar_color: string;
  created_at: string;
}

const AVATAR_COLORS = [
  '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', 
  '#EF4444', '#6366F1', '#14B8A6', '#F97316', '#84CC16'
];

export function useFamilyMembers() {
  const { user } = useAuth();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFamilyMembers = useCallback(async () => {
    if (!user) {
      setFamilyMembers([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setFamilyMembers(data || []);
    } catch (error) {
      console.error('Error fetching family members:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFamilyMembers();
  }, [fetchFamilyMembers]);

  const addFamilyMember = async (name: string) => {
    if (!user) throw new Error('Must be logged in');
    
    const usedColors = new Set(familyMembers.map(m => m.avatar_color));
    const availableColor = AVATAR_COLORS.find(c => !usedColors.has(c)) || AVATAR_COLORS[0];

    const { data, error } = await supabase
      .from('family_members')
      .insert({
        user_id: user.id,
        name: name.trim(),
        avatar_color: availableColor,
      })
      .select()
      .single();

    if (error) throw error;
    setFamilyMembers(prev => [...prev, data]);
    return data;
  };

  const updateFamilyMember = async (id: string, updates: { name?: string; avatar_color?: string }) => {
    if (!user) throw new Error('Must be logged in');

    const { data, error } = await supabase
      .from('family_members')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    setFamilyMembers(prev => prev.map(m => m.id === id ? data : m));
    return data;
  };

  const deleteFamilyMember = async (id: string) => {
    if (!user) throw new Error('Must be logged in');

    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('id', id);

    if (error) throw error;
    setFamilyMembers(prev => prev.filter(m => m.id !== id));
  };

  return {
    familyMembers,
    loading,
    addFamilyMember,
    updateFamilyMember,
    deleteFamilyMember,
    refreshFamilyMembers: fetchFamilyMembers,
    availableColors: AVATAR_COLORS,
  };
}
