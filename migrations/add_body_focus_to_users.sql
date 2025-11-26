-- Add body_focus column to users table
-- This allows users to select up to 3 target body parts for personalized workout recommendations

-- Add the column as TEXT[] (array of strings)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS body_focus TEXT[];

-- Add comment to explain the column
COMMENT ON COLUMN users.body_focus IS 'Target body parts for workout recommendations - array of up to 3 areas (chest, back, shoulders, arms, abs, legs, glutes, cardio). NULL until user sets preferences.';

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_users_body_focus ON users USING GIN (body_focus);

-- Add a check constraint to ensure max 3 selections (optional but recommended)
ALTER TABLE users
ADD CONSTRAINT check_body_focus_max_3
CHECK (body_focus IS NULL OR array_length(body_focus, 1) <= 3);
