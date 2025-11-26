-- Fix Foreign Key Constraints for Workout Planner Tables
-- This migration fixes the user_id foreign key references to point to public.users
-- (the custom users table used by this app, not auth.users)

-- ============================================================================
-- Drop existing foreign key constraints
-- ============================================================================

-- Drop foreign key constraint from workout_plans
ALTER TABLE workout_plans
    DROP CONSTRAINT IF EXISTS workout_plans_user_id_fkey;

-- Drop foreign key constraint from workout_plan_preferences
ALTER TABLE workout_plan_preferences
    DROP CONSTRAINT IF EXISTS workout_plan_preferences_user_id_fkey;

-- Drop foreign key constraint from workout_completions
ALTER TABLE workout_completions
    DROP CONSTRAINT IF EXISTS workout_completions_user_id_fkey;

-- ============================================================================
-- Add correct foreign key constraints referencing public.users
-- ============================================================================

-- Add foreign key constraint to workout_plans
ALTER TABLE workout_plans
    ADD CONSTRAINT workout_plans_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE;

-- Add foreign key constraint to workout_plan_preferences
ALTER TABLE workout_plan_preferences
    ADD CONSTRAINT workout_plan_preferences_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE;

-- Add foreign key constraint to workout_completions
ALTER TABLE workout_completions
    ADD CONSTRAINT workout_completions_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Foreign Key Constraints Fixed!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Updated tables:';
    RAISE NOTICE '  ✓ workout_plans.user_id → public.users(id)';
    RAISE NOTICE '  ✓ workout_plan_preferences.user_id → public.users(id)';
    RAISE NOTICE '  ✓ workout_completions.user_id → public.users(id)';
    RAISE NOTICE '';
    RAISE NOTICE 'You can now create workout plans!';
    RAISE NOTICE '========================================';
END $$;
