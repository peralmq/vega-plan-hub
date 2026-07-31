-- p4-01: rolling-plan schema (docs/research/r4-data-model-security.md §1,
-- approved at the 2026-07-31 gate). planned_meals + plan_batches replace
-- meal_plans + daily_meals (old tables kept until a later cleanup migration);
-- shopping_list_items persists the list; product_preferences is the
-- append-only store of record for "which product does <ingredient> mean";
-- telegram_accounts is the bot allow-list + per-partner attribution.

-- A lock event: a batch of days planned + shopped together.
CREATE TABLE public.plan_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  locked_by UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  CONSTRAINT plan_batches_range_check CHECK (ends_on >= starts_on)
);

-- One row per planned day, keyed by calendar date (rolling horizon).
CREATE TABLE public.planned_meals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  meal_date DATE NOT NULL,
  recipe_id TEXT NOT NULL,
  servings_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  batch_id UUID REFERENCES public.plan_batches(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_meal_date UNIQUE (user_id, meal_date),
  CONSTRAINT planned_meals_servings_multiplier_check
    CHECK (servings_multiplier >= 0.5 AND servings_multiplier <= 4.0)
);

-- The persisted shopping list: recipe-derived rows regenerate per batch,
-- ad-hoc rows are batchless until shopping mode gathers them (gate call).
CREATE TABLE public.shopping_list_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('recipe', 'adhoc')),
  batch_id UUID REFERENCES public.plan_batches(id) ON DELETE CASCADE,
  canonical_ingredient TEXT,
  display_name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  note TEXT,
  added_by UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  checked_at TIMESTAMP WITH TIME ZONE,
  checked_by UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Append-only preference history: a row is current iff superseded_by IS NULL;
-- changes supersede rather than update (undo = re-pointing superseded_by).
CREATE TABLE public.product_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  canonical_ingredient TEXT NOT NULL,
  product_name TEXT NOT NULL,
  family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  superseded_by UUID REFERENCES public.product_preferences(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('explicit', 'correction', 'observed')),
  note TEXT
);

-- Telegram allow-list + attribution: which sender ids may drive the bot,
-- and which family member each one is.
CREATE TABLE public.telegram_accounts (
  telegram_user_id BIGINT NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL,
  family_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  display_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true
);

-- RLS: same per-user pattern as the existing tables (the bot authenticates
-- as the shared household user with RLS active — tech.spec.md "Chat assistant").
ALTER TABLE public.plan_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own plan batches"
  ON public.plan_batches FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage their own planned meals"
  ON public.planned_meals FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage their own shopping list items"
  ON public.shopping_list_items FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage their own product preferences"
  ON public.product_preferences FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage their own telegram accounts"
  ON public.telegram_accounts FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Query paths: date-window fetches and the current-preference lookup.
CREATE INDEX idx_planned_meals_user_date ON public.planned_meals (user_id, meal_date);
CREATE INDEX idx_shopping_list_items_user ON public.shopping_list_items (user_id, checked_at);
CREATE INDEX idx_product_preferences_current
  ON public.product_preferences (user_id, canonical_ingredient)
  WHERE superseded_by IS NULL;

-- Backfill: week_start (a Monday) + day_of_week (0..6) → calendar date.
-- Historical rows were never "locked", so batch_id stays NULL.
INSERT INTO public.planned_meals
  (user_id, meal_date, recipe_id, servings_multiplier, created_at)
SELECT
  mp.user_id,
  mp.week_start + dm.day_of_week,
  dm.recipe_id,
  dm.servings_multiplier,
  dm.created_at
FROM public.daily_meals dm
JOIN public.meal_plans mp ON mp.id = dm.meal_plan_id
ON CONFLICT (user_id, meal_date) DO NOTHING;
