-- Meal favorites: save meals for quick re-logging
-- A favorite can be a single food item or a group of items (recipe)

CREATE TABLE IF NOT EXISTS meal_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_recipe BOOLEAN DEFAULT false,
  meal_type TEXT DEFAULT 'snack',
  items JSONB NOT NULL DEFAULT '[]',
  total_calories INTEGER DEFAULT 0,
  total_protein_g DECIMAL(6,1) DEFAULT 0,
  total_carbs_g DECIMAL(6,1) DEFAULT 0,
  total_fat_g DECIMAL(6,1) DEFAULT 0,
  total_fiber_g DECIMAL(6,1) DEFAULT 0,
  total_sugar_g DECIMAL(6,1) DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_meal_favorites_user
  ON meal_favorites (user_id, use_count DESC);

-- Row-level security
ALTER TABLE meal_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own favorites"
  ON meal_favorites FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow service role full access
CREATE POLICY "Service role full access on meal_favorites"
  ON meal_favorites FOR ALL
  USING (auth.role() = 'service_role');
