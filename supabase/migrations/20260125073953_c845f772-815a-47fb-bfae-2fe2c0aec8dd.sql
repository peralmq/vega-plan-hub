-- Create meal_plans table for storing weekly meal plans
CREATE TABLE public.meal_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_week UNIQUE (user_id, week_start)
);

-- Create daily_meals table for storing individual day meals
CREATE TABLE public.daily_meals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  recipe_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_meal_plan_day UNIQUE (meal_plan_id, day_of_week)
);

-- Enable Row Level Security
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_meals ENABLE ROW LEVEL SECURITY;

-- Helper function to check meal plan ownership
CREATE OR REPLACE FUNCTION public.is_owner_of_meal_plan(plan_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.meal_plans 
    WHERE id = plan_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper function to check daily meal ownership via parent meal plan
CREATE OR REPLACE FUNCTION public.is_owner_of_daily_meal(meal_plan_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.meal_plans 
    WHERE id = meal_plan_id_param AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RLS policies for meal_plans
CREATE POLICY "Users can view their own meal plans"
  ON public.meal_plans FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own meal plans"
  ON public.meal_plans FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own meal plans"
  ON public.meal_plans FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own meal plans"
  ON public.meal_plans FOR DELETE
  USING (user_id = auth.uid());

-- RLS policies for daily_meals
CREATE POLICY "Users can view their own daily meals"
  ON public.daily_meals FOR SELECT
  USING (public.is_owner_of_daily_meal(meal_plan_id));

CREATE POLICY "Users can create daily meals for their plans"
  ON public.daily_meals FOR INSERT
  WITH CHECK (public.is_owner_of_daily_meal(meal_plan_id));

CREATE POLICY "Users can update their own daily meals"
  ON public.daily_meals FOR UPDATE
  USING (public.is_owner_of_daily_meal(meal_plan_id));

CREATE POLICY "Users can delete their own daily meals"
  ON public.daily_meals FOR DELETE
  USING (public.is_owner_of_daily_meal(meal_plan_id));

-- Trigger for updating updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_meal_plans_updated_at
  BEFORE UPDATE ON public.meal_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();