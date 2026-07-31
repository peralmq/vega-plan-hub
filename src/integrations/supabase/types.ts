export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      daily_meals: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          meal_plan_id: string
          recipe_id: string
          servings_multiplier: number
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          meal_plan_id: string
          recipe_id: string
          servings_multiplier?: number
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          meal_plan_id?: string
          recipe_id?: string
          servings_multiplier?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_meals_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          avatar_color: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          avatar_color?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          avatar_color?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_plans: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      plan_batches: {
        Row: {
          ends_on: string
          id: string
          locked_at: string
          locked_by: string | null
          starts_on: string
          user_id: string
        }
        Insert: {
          ends_on: string
          id?: string
          locked_at?: string
          locked_by?: string | null
          starts_on: string
          user_id: string
        }
        Update: {
          ends_on?: string
          id?: string
          locked_at?: string
          locked_by?: string | null
          starts_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_batches_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_meals: {
        Row: {
          batch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          meal_date: string
          recipe_id: string
          servings_multiplier: number
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          meal_date: string
          recipe_id: string
          servings_multiplier?: number
          user_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          meal_date?: string
          recipe_id?: string
          servings_multiplier?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_meals_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "plan_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_meals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      product_preferences: {
        Row: {
          canonical_ingredient: string
          family_member_id: string | null
          id: string
          note: string | null
          product_name: string
          source: string
          superseded_by: string | null
          user_id: string
          valid_from: string
        }
        Insert: {
          canonical_ingredient: string
          family_member_id?: string | null
          id?: string
          note?: string | null
          product_name: string
          source: string
          superseded_by?: string | null
          user_id: string
          valid_from?: string
        }
        Update: {
          canonical_ingredient?: string
          family_member_id?: string | null
          id?: string
          note?: string | null
          product_name?: string
          source?: string
          superseded_by?: string | null
          user_id?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_preferences_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_preferences_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "product_preferences"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          recipe_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          recipe_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          recipe_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recipe_ratings: {
        Row: {
          created_at: string
          family_member_id: string | null
          id: string
          rating: number
          recipe_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          family_member_id?: string | null
          id?: string
          rating: number
          recipe_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          family_member_id?: string | null
          id?: string
          rating?: number
          recipe_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ratings_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          added_by: string | null
          batch_id: string | null
          canonical_ingredient: string | null
          checked_at: string | null
          checked_by: string | null
          created_at: string
          display_name: string
          id: string
          note: string | null
          quantity: number | null
          source: string
          unit: string | null
          user_id: string
        }
        Insert: {
          added_by?: string | null
          batch_id?: string | null
          canonical_ingredient?: string | null
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          display_name: string
          id?: string
          note?: string | null
          quantity?: number | null
          source: string
          unit?: string | null
          user_id: string
        }
        Update: {
          added_by?: string | null
          batch_id?: string | null
          canonical_ingredient?: string | null
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          display_name?: string
          id?: string
          note?: string | null
          quantity?: number | null
          source?: string
          unit?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "plan_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_accounts: {
        Row: {
          active: boolean
          display_name: string | null
          family_member_id: string
          telegram_user_id: number
          user_id: string
        }
        Insert: {
          active?: boolean
          display_name?: string | null
          family_member_id: string
          telegram_user_id: number
          user_id: string
        }
        Update: {
          active?: boolean
          display_name?: string | null
          family_member_id?: string
          telegram_user_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_accounts_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_owner_of_daily_meal: {
        Args: { meal_plan_id_param: string }
        Returns: boolean
      }
      is_owner_of_meal_plan: { Args: { plan_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
