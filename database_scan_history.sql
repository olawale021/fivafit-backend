-- Scan History Table for storing user equipment scans
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS scan_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User reference
    user_id UUID NOT NULL,

    -- Equipment information
    equipment_name VARCHAR(255) NOT NULL,
    equipment_category VARCHAR(100),

    -- Complete scan results (stored as JSONB)
    scan_result JSONB NOT NULL,
    -- Structure:
    -- {
    --   "name": "Equipment Name",
    --   "target_muscles": [...],
    --   "usage_tips": [...],
    --   "recommended_workouts": [...],
    --   "_meta": { "cached": true/false, "category": "..." }
    -- }

    -- Image data (optional - can store thumbnail or reference)
    image_url TEXT,

    -- Metadata
    was_cached BOOLEAN DEFAULT false,
    scan_duration_ms INTEGER,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_scan_history_user_id ON scan_history(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_history_created_at ON scan_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_history_equipment_category ON scan_history(equipment_category);
CREATE INDEX IF NOT EXISTS idx_scan_history_equipment_name ON scan_history(equipment_name);

-- Create composite index for user queries
CREATE INDEX IF NOT EXISTS idx_scan_history_user_created ON scan_history(user_id, created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_scan_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic updated_at
CREATE TRIGGER update_scan_history_timestamp
    BEFORE UPDATE ON scan_history
    FOR EACH ROW
    EXECUTE FUNCTION update_scan_history_updated_at();

-- Add helpful comments
COMMENT ON TABLE scan_history IS 'Stores user equipment scan history with complete analysis results';
COMMENT ON COLUMN scan_history.user_id IS 'Reference to the user who performed the scan';
COMMENT ON COLUMN scan_history.scan_result IS 'Complete JSON response from AI analysis';
COMMENT ON COLUMN scan_history.was_cached IS 'Whether the result was served from cache or fresh AI call';
COMMENT ON COLUMN scan_history.scan_duration_ms IS 'Time taken to process the scan in milliseconds';
