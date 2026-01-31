-- Add servings_multiplier column to daily_meals table
-- Default is 1.0 (original servings), can be increased for leftovers
ALTER TABLE public.daily_meals 
ADD COLUMN servings_multiplier numeric NOT NULL DEFAULT 1.0;

-- Add a check constraint to ensure multiplier is reasonable (0.5 to 4x)
ALTER TABLE public.daily_meals 
ADD CONSTRAINT daily_meals_servings_multiplier_check 
CHECK (servings_multiplier >= 0.5 AND servings_multiplier <= 4.0);