-- Saved recipes from the Edamam Recipe Search API.
-- Edamam's license only permits storing: recipe URI/ID, label, image URL,
-- and the four basic per-serving macros (calories, protein, fat, net carbs).
-- Full recipe data (ingredients, nutrients, source URL) is re-fetched by ID on open.

CREATE TABLE IF NOT EXISTS saved_recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL,
  recipe_uri TEXT NOT NULL,
  label TEXT NOT NULL,
  image_url TEXT,
  calories INTEGER DEFAULT 0,
  protein_g DECIMAL(6,1) DEFAULT 0,
  fat_g DECIMAL(6,1) DEFAULT 0,
  carbs_g DECIMAL(6,1) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, recipe_id)
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_saved_recipes_user
  ON saved_recipes (user_id, created_at DESC);

-- Row-level security
ALTER TABLE saved_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own saved recipes"
  ON saved_recipes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow service role full access
CREATE POLICY "Service role full access on saved_recipes"
  ON saved_recipes FOR ALL
  USING (auth.role() = 'service_role');
