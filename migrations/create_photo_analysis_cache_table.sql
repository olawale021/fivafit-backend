-- Photo analysis cache: same photo always returns identical nutrition results
-- Cache key is SHA-256 hash of the image buffer
-- Eliminates OpenAI + Perplexity inconsistency for repeated scans of same photo

CREATE TABLE IF NOT EXISTS photo_analysis_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_hash TEXT NOT NULL UNIQUE,
  result JSONB NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_analysis_cache_last_used
  ON photo_analysis_cache (last_used_at);
