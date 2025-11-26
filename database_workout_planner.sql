-- Workout Planner Database Schema
-- AI-powered personalized workout plan generation and tracking
-- Run this in your Supabase SQL Editor
--
-- NOTE: All business logic (stats updates, validations) handled in backend code

-- ============================================================================
-- TABLE: workout_plans
-- Stores AI-generated weekly workout plans for users
-- ============================================================================

CREATE TABLE IF NOT EXISTS workout_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Plan metadata
    plan_name VARCHAR(255) NOT NULL,
    description TEXT,

    -- User preferences used to generate this plan
    fitness_goals JSONB NOT NULL, -- Array: ["lose_weight", "gain_muscle", "improve_endurance", "general_fitness"]
    target_body_parts JSONB NOT NULL, -- Array: ["chest", "back", "legs", "arms", "shoulders", "core"]

    -- Schedule configuration
    days_per_week INTEGER NOT NULL CHECK (days_per_week BETWEEN 1 AND 7),
    hours_per_session DECIMAL(3,1) NOT NULL CHECK (hours_per_session > 0 AND hours_per_session <= 5),
    selected_days JSONB, -- Array: ["monday", "wednesday", "friday"] or null for flexible

    -- Plan structure
    total_weeks INTEGER DEFAULT 1,
    total_workouts INTEGER DEFAULT 0, -- Updated in backend code
    completed_workouts INTEGER DEFAULT 0, -- Updated in backend code

    -- Status
    is_active BOOLEAN DEFAULT true, -- Enforced in backend code
    is_ai_generated BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for workout_plans
CREATE INDEX IF NOT EXISTS idx_workout_plans_user_id ON workout_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_is_active ON workout_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_workout_plans_created_at ON workout_plans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_plans_user_active ON workout_plans(user_id, is_active);

-- Comments
COMMENT ON TABLE workout_plans IS 'Stores AI-generated personalized weekly workout plans';
COMMENT ON COLUMN workout_plans.fitness_goals IS 'Array of fitness goals: lose_weight, gain_muscle, improve_endurance, general_fitness';
COMMENT ON COLUMN workout_plans.target_body_parts IS 'Array of target body parts: chest, back, legs, arms, shoulders, core';
COMMENT ON COLUMN workout_plans.selected_days IS 'Specific days for workouts or null for flexible scheduling';
COMMENT ON COLUMN workout_plans.is_active IS 'Only one plan can be active per user - enforced in backend code';

-- ============================================================================
-- TABLE: daily_workouts
-- Individual day's workout within a workout plan
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_plan_id UUID NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,

    -- Day information
    day_of_week VARCHAR(20), -- "monday", "tuesday", etc., or null for flexible
    week_number INTEGER DEFAULT 1 CHECK (week_number > 0),
    day_order INTEGER NOT NULL CHECK (day_order > 0), -- 1, 2, 3, etc.

    -- Workout details
    workout_name VARCHAR(255) NOT NULL,
    focus_area VARCHAR(100), -- "Upper Body", "Lower Body", "Full Body", "Cardio"
    target_muscles JSONB, -- Array: ["chest", "triceps", "shoulders"]

    -- Duration
    estimated_duration_minutes INTEGER,

    -- Exercises with parameters (JSONB array)
    exercises JSONB NOT NULL,
    /* Structure:
    [
      {
        "exercise_id": "ex_123",
        "sets": 3,
        "reps": "10-12",
        "rest_seconds": 90,
        "tempo": "2-0-2-0",
        "notes": "Focus on form over weight"
      }
    ]
    */

    -- AI-generated guidance
    warm_up TEXT,
    cool_down TEXT,
    workout_tips TEXT,

    -- Completion tracking (updated in backend code)
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    actual_duration_minutes INTEGER,
    difficulty_rating INTEGER CHECK (difficulty_rating BETWEEN 1 AND 5),
    completion_notes TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for daily_workouts
CREATE INDEX IF NOT EXISTS idx_daily_workouts_plan_id ON daily_workouts(workout_plan_id);
CREATE INDEX IF NOT EXISTS idx_daily_workouts_day_order ON daily_workouts(workout_plan_id, day_order);
CREATE INDEX IF NOT EXISTS idx_daily_workouts_week_number ON daily_workouts(workout_plan_id, week_number);
CREATE INDEX IF NOT EXISTS idx_daily_workouts_is_completed ON daily_workouts(is_completed);
CREATE INDEX IF NOT EXISTS idx_daily_workouts_exercises ON daily_workouts USING gin(exercises);

-- Comments
COMMENT ON TABLE daily_workouts IS 'Individual workouts within a workout plan';
COMMENT ON COLUMN daily_workouts.exercises IS 'JSONB array of exercises with sets, reps, rest, and notes';
COMMENT ON COLUMN daily_workouts.day_of_week IS 'Specific day or null for flexible scheduling';
COMMENT ON COLUMN daily_workouts.day_order IS 'Sequential order of workout in the plan (1, 2, 3...)';

-- ============================================================================
-- TABLE: workout_plan_preferences
-- User's saved workout planner preferences
-- ============================================================================

CREATE TABLE IF NOT EXISTS workout_plan_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,

    -- Default preferences (pre-filled when creating new plan)
    default_fitness_goals JSONB, -- ["lose_weight", "gain_muscle"]
    default_target_body_parts JSONB, -- ["chest", "back", "legs", "arms", "shoulders", "core"]
    default_days_per_week INTEGER DEFAULT 3 CHECK (default_days_per_week BETWEEN 1 AND 7),
    default_hours_per_session DECIMAL(3,1) DEFAULT 1.0 CHECK (default_hours_per_session > 0),
    default_selected_days JSONB, -- ["monday", "wednesday", "friday"]

    -- User fitness level (used by AI)
    fitness_level VARCHAR(50) DEFAULT 'beginner' CHECK (fitness_level IN ('beginner', 'intermediate', 'advanced')),

    -- Available equipment (optional, for future use)
    available_equipment JSONB, -- ["dumbbells", "barbell", "machines", "bodyweight"]

    -- Preferences
    prefer_compound_exercises BOOLEAN DEFAULT true,
    prefer_short_rest_periods BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for workout_plan_preferences
CREATE INDEX IF NOT EXISTS idx_workout_plan_preferences_user_id ON workout_plan_preferences(user_id);

-- Comments
COMMENT ON TABLE workout_plan_preferences IS 'User preferences for workout plan generation';
COMMENT ON COLUMN workout_plan_preferences.fitness_level IS 'User fitness level: beginner, intermediate, advanced';

-- ============================================================================
-- TABLE: workout_completions
-- Track individual workout completions (for analytics and social feed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workout_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    daily_workout_id UUID NOT NULL REFERENCES daily_workouts(id) ON DELETE CASCADE,
    workout_plan_id UUID NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,

    -- Completion details
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    duration_minutes INTEGER,
    difficulty_rating INTEGER CHECK (difficulty_rating BETWEEN 1 AND 5),
    energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5), -- How energized user felt
    notes TEXT,

    -- Exercise-specific tracking (optional)
    exercises_completed JSONB, -- Track which exercises were done and skipped
    /* Structure:
    [
      {
        "exercise_id": "ex_123",
        "completed": true,
        "sets_completed": 3,
        "notes": "Felt strong today"
      }
    ]
    */

    -- Social sharing (for future social features integration)
    shared_to_feed BOOLEAN DEFAULT false,
    activity_id UUID, -- References activities table from social features (if implemented)

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for workout_completions
CREATE INDEX IF NOT EXISTS idx_workout_completions_user_id ON workout_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_completions_plan_id ON workout_completions(workout_plan_id);
CREATE INDEX IF NOT EXISTS idx_workout_completions_daily_workout ON workout_completions(daily_workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_completions_completed_at ON workout_completions(completed_at DESC);

-- Comments
COMMENT ON TABLE workout_completions IS 'Records of completed workouts for tracking and analytics';
COMMENT ON COLUMN workout_completions.difficulty_rating IS 'User-rated difficulty: 1 (too easy) to 5 (too hard)';
COMMENT ON COLUMN workout_completions.energy_level IS 'User energy level after workout: 1 (exhausted) to 5 (energized)';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_plan_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_completions ENABLE ROW LEVEL SECURITY;

-- Policies for workout_plans
CREATE POLICY "Users can view their own workout plans"
    ON workout_plans FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own workout plans"
    ON workout_plans FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workout plans"
    ON workout_plans FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workout plans"
    ON workout_plans FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Policies for daily_workouts (accessible via workout_plan ownership)
CREATE POLICY "Users can view daily workouts of their plans"
    ON daily_workouts FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM workout_plans
            WHERE workout_plans.id = daily_workouts.workout_plan_id
            AND workout_plans.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create daily workouts for their plans"
    ON daily_workouts FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workout_plans
            WHERE workout_plans.id = daily_workouts.workout_plan_id
            AND workout_plans.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update daily workouts of their plans"
    ON daily_workouts FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM workout_plans
            WHERE workout_plans.id = daily_workouts.workout_plan_id
            AND workout_plans.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workout_plans
            WHERE workout_plans.id = daily_workouts.workout_plan_id
            AND workout_plans.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete daily workouts of their plans"
    ON daily_workouts FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM workout_plans
            WHERE workout_plans.id = daily_workouts.workout_plan_id
            AND workout_plans.user_id = auth.uid()
        )
    );

-- Policies for workout_plan_preferences
CREATE POLICY "Users can view their own preferences"
    ON workout_plan_preferences FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own preferences"
    ON workout_plan_preferences FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
    ON workout_plan_preferences FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preferences"
    ON workout_plan_preferences FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Policies for workout_completions
CREATE POLICY "Users can view their own completions"
    ON workout_completions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own completions"
    ON workout_completions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own completions"
    ON workout_completions FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own completions"
    ON workout_completions FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Workout Planner Database Setup Complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  ✓ workout_plans';
    RAISE NOTICE '  ✓ daily_workouts';
    RAISE NOTICE '  ✓ workout_plan_preferences';
    RAISE NOTICE '  ✓ workout_completions';
    RAISE NOTICE '';
    RAISE NOTICE 'Features enabled:';
    RAISE NOTICE '  ✓ Row Level Security (RLS)';
    RAISE NOTICE '  ✓ Indexes for performance';
    RAISE NOTICE '  ✓ Foreign key constraints';
    RAISE NOTICE '  ✓ Check constraints';
    RAISE NOTICE '';
    RAISE NOTICE 'Business logic location:';
    RAISE NOTICE '  → All logic handled in backend code';
    RAISE NOTICE '  → No database triggers/functions';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Run this SQL in Supabase SQL Editor';
    RAISE NOTICE '  2. Set up backend API routes';
    RAISE NOTICE '  3. Implement services with business logic';
    RAISE NOTICE '  4. Integrate OpenAI for plan generation';
    RAISE NOTICE '  5. Create mobile UI screens';
    RAISE NOTICE '========================================';
END $$;
