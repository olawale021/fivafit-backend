-- Migration: Update exercises table for ExerciseDB API structure
-- This updates the schema to match the new ExerciseDB API from RapidAPI

-- Drop old indexes that won't be needed
DROP INDEX IF EXISTS idx_exercises_level;
DROP INDEX IF EXISTS idx_exercises_mechanic;
DROP INDEX IF EXISTS idx_exercises_primary_muscles;

-- Add new columns for ExerciseDB API
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS "bodyPart" TEXT,
ADD COLUMN IF NOT EXISTS target TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'));

-- Drop columns that don't exist in new API
ALTER TABLE exercises
DROP COLUMN IF EXISTS force,
DROP COLUMN IF EXISTS level,
DROP COLUMN IF EXISTS mechanic,
DROP COLUMN IF EXISTS "primaryMuscles",
DROP COLUMN IF EXISTS images;

-- Rename secondaryMuscles to match API format (no quotes needed)
ALTER TABLE exercises
RENAME COLUMN "secondaryMuscles" TO secondary_muscles;

-- Create new indexes for faster searching
CREATE INDEX IF NOT EXISTS idx_exercises_body_part ON exercises("bodyPart");
CREATE INDEX IF NOT EXISTS idx_exercises_target ON exercises(target);
CREATE INDEX IF NOT EXISTS idx_exercises_difficulty ON exercises(difficulty);
CREATE INDEX IF NOT EXISTS idx_exercises_secondary_muscles ON exercises USING gin(secondary_muscles);

-- Update category column to have proper enum check
ALTER TABLE exercises
DROP CONSTRAINT IF EXISTS exercises_category_check;

ALTER TABLE exercises
ADD CONSTRAINT exercises_category_check
CHECK (category IN ('strength', 'cardio', 'mobility', 'balance', 'stretching', 'plyometrics', 'rehabilitation'));

-- Comment on table
COMMENT ON TABLE exercises IS 'Exercise data from ExerciseDB API (exercisedb.p.rapidapi.com)';
COMMENT ON COLUMN exercises."bodyPart" IS 'Primary body part targeted';
COMMENT ON COLUMN exercises.target IS 'Target muscle group';
COMMENT ON COLUMN exercises.description IS 'Exercise overview';
COMMENT ON COLUMN exercises.difficulty IS 'Difficulty level: beginner, intermediate, or advanced';
COMMENT ON COLUMN exercises.category IS 'Exercise category: strength, cardio, mobility, balance, stretching, plyometrics, or rehabilitation';
