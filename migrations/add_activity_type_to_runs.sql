-- Add activity_type column to runs table (run or walk)
ALTER TABLE runs ADD COLUMN IF NOT EXISTS activity_type TEXT DEFAULT 'run';
