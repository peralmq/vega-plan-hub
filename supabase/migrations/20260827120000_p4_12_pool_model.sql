-- p4-12: pool model schema delta (tech.spec.md "Pool model", directive
-- Pelle 2026-08-27, gate confirmed at p4-12 dispatch 2026-08-27).
-- `planned_meals` rows become batch pool entries, not date assignments —
-- a meal prep is simply the same `recipe_id` twice in the same batch.
-- Minimal delta: `meal_date` becomes optional (new pool writes leave it
-- null; existing date-keyed rows from the p4-01 backfill are untouched)
-- and `cooked_on` stamps the date a pool entry was picked/cooked in Cook
-- Mode. The per-(user_id, meal_date) uniqueness no longer models anything
-- once meal_date isn't the pool key, so it is dropped rather than kept as
-- vestigial (nothing in the new read/write path relies on it).

ALTER TABLE public.planned_meals
  ALTER COLUMN meal_date DROP NOT NULL;

ALTER TABLE public.planned_meals
  DROP CONSTRAINT IF EXISTS unique_user_meal_date;

ALTER TABLE public.planned_meals
  ADD COLUMN cooked_on DATE;

-- Query path: a batch's remaining/cooked partition (planPool.ts).
CREATE INDEX idx_planned_meals_batch_cooked
  ON public.planned_meals (batch_id, cooked_on);
