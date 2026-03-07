-- Migration: Create food_logs table for calorie & macro tracking
-- Run this in Supabase SQL Editor

-- Create food_logs table
CREATE TABLE IF NOT EXISTS food_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  calories INTEGER NOT NULL DEFAULT 0,
  protein_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  carbs_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  fat_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  fiber_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  serving_size TEXT,
  servings NUMERIC(5,2) NOT NULL DEFAULT 1,
  meal_type TEXT NOT NULL DEFAULT 'snack' CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  image_url TEXT,
  ai_identified BOOLEAN NOT NULL DEFAULT false,
  ai_raw_response JSONB,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_food_logs_user_date ON food_logs (user_id, logged_at);
CREATE INDEX idx_food_logs_meal_type ON food_logs (meal_type);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_food_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_food_logs_updated_at
  BEFORE UPDATE ON food_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_food_logs_updated_at();

-- Row Level Security
ALTER TABLE food_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own food logs
CREATE POLICY "Users can view own food logs"
  ON food_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own food logs
CREATE POLICY "Users can insert own food logs"
  ON food_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own food logs
CREATE POLICY "Users can update own food logs"
  ON food_logs FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own food logs
CREATE POLICY "Users can delete own food logs"
  ON food_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can access all food logs (for backend API)
CREATE POLICY "Service role can access all food logs"
  ON food_logs FOR ALL
  USING (auth.role() = 'service_role');

-- Create food-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('food-images', 'food-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for food-images bucket
CREATE POLICY "Users can upload food images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'food-images' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view food images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'food-images');

CREATE POLICY "Users can delete own food images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'food-images' AND auth.uid()::text = (storage.foldername(name))[1]);
