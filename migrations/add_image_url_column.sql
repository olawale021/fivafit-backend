-- Add image_url column to exercises table
-- Run this if you already have the exercises table and don't want to drop it

ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN exercises.image_url IS 'URL to exercise image/GIF from ExerciseDB CDN';
