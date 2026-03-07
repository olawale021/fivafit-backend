-- Barcode cache: stores Open Food Facts lookups to avoid repeat API calls
-- Cache key is the barcode string (UPC/EAN)

CREATE TABLE IF NOT EXISTS barcode_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode TEXT NOT NULL UNIQUE,
  product_name TEXT,
  brand TEXT,
  serving_size TEXT,
  calories INTEGER DEFAULT 0,
  protein_g DECIMAL(6,1) DEFAULT 0,
  carbs_g DECIMAL(6,1) DEFAULT 0,
  fat_g DECIMAL(6,1) DEFAULT 0,
  fiber_g DECIMAL(6,1) DEFAULT 0,
  sugar_g DECIMAL(6,1) DEFAULT 0,
  image_url TEXT,
  raw_response JSONB,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_barcode_cache_barcode
  ON barcode_cache (barcode);

CREATE INDEX IF NOT EXISTS idx_barcode_cache_last_used
  ON barcode_cache (last_used_at);
