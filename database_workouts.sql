-- Workouts Table - Shared workout library
-- Each workout is stored once and can be referenced by multiple equipment
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Unique workout identifier
    name VARCHAR(255) NOT NULL UNIQUE,

    -- Workout details
    level VARCHAR(50) NOT NULL, -- Beginner, Intermediate, Hypertrophy, Strength, Endurance
    reps VARCHAR(50) NOT NULL,
    sets VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    rest_period VARCHAR(50) NOT NULL,
    tempo VARCHAR(100) NOT NULL,
    duration VARCHAR(50) NOT NULL,

    -- Instructions and exercises (arrays)
    instructions JSONB NOT NULL, -- Array of step-by-step instructions
    exercises JSONB NOT NULL, -- Array of exercise variations

    -- Tips and guidance
    common_mistakes JSONB NOT NULL, -- Array of common mistakes
    safety_tips JSONB NOT NULL, -- Array of safety tips
    biomechanics TEXT NOT NULL,
    progressions JSONB NOT NULL, -- Array of progression strategies
    regressions JSONB NOT NULL, -- Array of regression options
    progression_to_next TEXT NOT NULL,

    -- Metadata
    times_used INTEGER DEFAULT 0, -- How many times this workout has been referenced
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_workouts_name ON workouts(name);
CREATE INDEX IF NOT EXISTS idx_workouts_level ON workouts(level);
CREATE INDEX IF NOT EXISTS idx_workouts_times_used ON workouts(times_used DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic updated_at
CREATE TRIGGER update_workouts_timestamp
    BEFORE UPDATE ON workouts
    FOR EACH ROW
    EXECUTE FUNCTION update_workouts_updated_at();

-- Add helpful comments
COMMENT ON TABLE workouts IS 'Shared library of workout programs that can be reused across equipment';
COMMENT ON COLUMN workouts.name IS 'Unique workout identifier, e.g., "Beginner Lat Pulldown Form Training"';
COMMENT ON COLUMN workouts.times_used IS 'Counter for how many equipment entries reference this workout';
