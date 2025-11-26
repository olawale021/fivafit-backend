-- Add fitness_levels column to users table (plural - array of levels)
-- This allows users to select multiple fitness levels for exercise recommendations
-- Starts as NULL until user explicitly sets their fitness levels

ALTER TABLE users
ADD COLUMN IF NOT EXISTS fitness_levels TEXT[];

-- Add comment to column
COMMENT ON COLUMN users.fitness_levels IS 'User fitness levels for exercise recommendations - array of (beginner, intermediate, advanced). NULL until user sets preferences.';
