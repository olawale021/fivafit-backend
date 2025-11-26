-- Equipment Cache Table for storing AI-generated equipment analysis
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS equipment_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Equipment identification
    equipment_name VARCHAR(255) NOT NULL,
    equipment_category VARCHAR(100) NOT NULL, -- e.g., 'dumbbells', 'barbell', 'machine', 'cable', 'bodyweight'

    -- AI-generated content
    target_muscles JSONB NOT NULL,
    usage_tips JSONB NOT NULL,
    recommended_workouts JSONB NOT NULL,

    -- Personalization metadata
    gender_targeted VARCHAR(20), -- 'male', 'female', 'all'
    fitness_level VARCHAR(50), -- 'beginner', 'intermediate', 'advanced', 'all'

    -- Cache management
    variation_number INTEGER NOT NULL DEFAULT 1,
    times_served INTEGER DEFAULT 0,
    last_served_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment_cache(equipment_category);
CREATE INDEX IF NOT EXISTS idx_equipment_name ON equipment_cache(equipment_name);
CREATE INDEX IF NOT EXISTS idx_gender_targeted ON equipment_cache(gender_targeted);
CREATE INDEX IF NOT EXISTS idx_times_served ON equipment_cache(times_served);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_equipment_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic updated_at
CREATE TRIGGER update_equipment_cache_timestamp
    BEFORE UPDATE ON equipment_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_equipment_cache_updated_at();

-- Add some helpful comments
COMMENT ON TABLE equipment_cache IS 'Stores cached AI-generated equipment analysis to reduce API costs';
COMMENT ON COLUMN equipment_cache.equipment_category IS 'Category for matching similar equipment (dumbbells, barbells, machines, etc.)';
COMMENT ON COLUMN equipment_cache.variation_number IS 'Variation number (1-15) for this equipment category';
COMMENT ON COLUMN equipment_cache.times_served IS 'Number of times this cached response has been served to users';
COMMENT ON COLUMN equipment_cache.gender_targeted IS 'Gender this variation is optimized for (male/female/all)';
