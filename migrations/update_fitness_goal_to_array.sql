-- Change fitness_goal from single varchar to array of goals (max 3)
-- This allows users to select up to 3 fitness goals for comprehensive recommendations

-- First, convert existing single values to arrays
-- Users with a current goal will have it converted to a single-element array
-- Users without a goal will remain NULL
UPDATE users
SET fitness_goal = ARRAY[fitness_goal]::TEXT[]
WHERE fitness_goal IS NOT NULL;

-- Now change the column type to TEXT[]
ALTER TABLE users
ALTER COLUMN fitness_goal TYPE TEXT[] USING
  CASE
    WHEN fitness_goal IS NULL THEN NULL
    ELSE ARRAY[fitness_goal]::TEXT[]
  END;

-- Add comment to column
COMMENT ON COLUMN users.fitness_goal IS 'User fitness goals for exercise recommendations - array of up to 3 goals (weight_loss, muscle_building, general_fitness, flexibility, athletic_performance, endurance, rehabilitation). NULL until user sets preferences.';
