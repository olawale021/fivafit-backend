-- Add warm_up_exercises column to daily_workouts table
-- This will store actual exercises from the database instead of just text tips
-- Format: JSONB array similar to exercises column

-- Add the new column
ALTER TABLE daily_workouts
ADD COLUMN IF NOT EXISTS warm_up_exercises JSONB DEFAULT '[]'::jsonb;

-- Add comment
COMMENT ON COLUMN daily_workouts.warm_up_exercises IS 'Array of warm-up exercises with full details from database (id, name, image_url, etc.)';

-- Optional: Add an index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_daily_workouts_warm_up_exercises ON daily_workouts USING gin(warm_up_exercises);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Added warm_up_exercises column to daily_workouts table';
    RAISE NOTICE '   - Column type: JSONB';
    RAISE NOTICE '   - Default value: []';
    RAISE NOTICE '   - GIN index created for performance';
END $$;
