-- Create exercises table matching ExerciseDB API structure (exercisedb.p.rapidapi.com)
CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "bodyPart" TEXT,
    target TEXT,
    equipment TEXT,
    secondary_muscles TEXT[],
    instructions TEXT[],
    description TEXT,
    difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    category TEXT CHECK (category IN ('strength', 'cardio', 'mobility', 'balance', 'stretching', 'plyometrics', 'rehabilitation')),
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster searching and filtering
CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises(equipment);
CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);
CREATE INDEX IF NOT EXISTS idx_exercises_body_part ON exercises("bodyPart");
CREATE INDEX IF NOT EXISTS idx_exercises_target ON exercises(target);
CREATE INDEX IF NOT EXISTS idx_exercises_difficulty ON exercises(difficulty);
CREATE INDEX IF NOT EXISTS idx_exercises_secondary_muscles ON exercises USING gin(secondary_muscles);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_exercises_updated_at ON exercises;
CREATE TRIGGER update_exercises_updated_at
    BEFORE UPDATE ON exercises
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can read exercises
CREATE POLICY "Anyone can read exercises"
    ON exercises FOR SELECT
    TO authenticated
    USING (true);
