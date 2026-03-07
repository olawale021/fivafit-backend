-- Add customizable macro goal columns to users table
-- Stores percentage splits (should sum to 100) and daily sugar goal in grams
-- Sugar default 50g per WHO recommendation (<10% of 2000 kcal)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS macro_protein_pct INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS macro_carbs_pct INTEGER DEFAULT 40,
  ADD COLUMN IF NOT EXISTS macro_fat_pct INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS daily_sugar_goal INTEGER DEFAULT 50;
