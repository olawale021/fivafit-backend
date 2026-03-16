-- Add steps column to runs table
ALTER TABLE runs ADD COLUMN IF NOT EXISTS steps INTEGER DEFAULT 0;
