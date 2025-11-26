-- Migration: Update equipment_cache to reference workouts table
-- This changes the structure from storing full workout data to storing workout IDs
-- Run this AFTER creating the workouts table

-- Step 1: Add new column for workout references (array of workout IDs)
ALTER TABLE equipment_cache
ADD COLUMN IF NOT EXISTS workout_ids UUID[] DEFAULT '{}';

-- Step 2: Make recommended_workouts nullable (for backward compatibility)
-- This allows the new system to use workout_ids while old data uses recommended_workouts
ALTER TABLE equipment_cache
ALTER COLUMN recommended_workouts DROP NOT NULL;

-- Step 3: Create index for workout_ids
CREATE INDEX IF NOT EXISTS idx_equipment_cache_workout_ids ON equipment_cache USING GIN(workout_ids);

-- Step 4: (Optional) Keep recommended_workouts for backward compatibility during migration
-- You can drop this column later once all data is migrated and you want to clean up:
-- ALTER TABLE equipment_cache DROP COLUMN recommended_workouts;

-- Add helpful comments
COMMENT ON COLUMN equipment_cache.workout_ids IS 'Array of workout IDs from the workouts table';
COMMENT ON COLUMN equipment_cache.recommended_workouts IS 'Legacy field - kept for backward compatibility, will be null for new entries using workout_ids';

-- Note: After running this migration, update your application code to:
-- 1. Save new workouts to the workouts table first
-- 2. Store workout IDs in the workout_ids array
-- 3. Join with workouts table when retrieving equipment data
