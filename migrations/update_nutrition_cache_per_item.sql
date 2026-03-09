-- Migration: Update nutrition_cache for per-item caching with serving size scaling
-- Cache key changes from (food_name_normalized, serving_size) to (food_name_normalized) only
-- Adds reference_grams for proportional scaling on future lookups

-- Step 1: Add new columns
ALTER TABLE nutrition_cache
  ADD COLUMN IF NOT EXISTS reference_grams DECIMAL(8,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS serving_size_original TEXT DEFAULT NULL;

-- Step 2: Deduplicate existing rows — keep the row with highest hit_count per food name
DELETE FROM nutrition_cache
WHERE id NOT IN (
  SELECT DISTINCT ON (food_name_normalized) id
  FROM nutrition_cache
  ORDER BY food_name_normalized, hit_count DESC, created_at DESC
);

-- Step 3: Drop old composite unique index
DROP INDEX IF EXISTS idx_nutrition_cache_lookup;

-- Step 4: Create new unique index on food_name_normalized only
CREATE UNIQUE INDEX idx_nutrition_cache_lookup
  ON nutrition_cache (food_name_normalized);
