-- Nutrition cache: stores Perplexity AI nutrition lookups to avoid repeat API calls
-- Cache key is normalized food name + serving size
-- Entries expire after 30 days (checked at query time)

CREATE TABLE IF NOT EXISTS nutrition_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  food_name_normalized TEXT NOT NULL,
  serving_size TEXT NOT NULL,
  calories INTEGER NOT NULL DEFAULT 0,
  protein_g DECIMAL(6,1) NOT NULL DEFAULT 0,
  carbs_g DECIMAL(6,1) NOT NULL DEFAULT 0,
  fat_g DECIMAL(6,1) NOT NULL DEFAULT 0,
  fiber_g DECIMAL(6,1) NOT NULL DEFAULT 0,
  sugar_g DECIMAL(6,1) NOT NULL DEFAULT 0,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint on food name + serving for upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_nutrition_cache_lookup
  ON nutrition_cache (food_name_normalized, serving_size);

-- Index for cleanup of stale entries
CREATE INDEX IF NOT EXISTS idx_nutrition_cache_last_used
  ON nutrition_cache (last_used_at);
