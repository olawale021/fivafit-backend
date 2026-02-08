-- Add columns for smart trigger tracking in Live Activity updates
-- These columns enable delta-based push triggers and freshness checks
-- Run this in your Supabase SQL editor

-- Add column to track last pushed step count (for delta calculation)
ALTER TABLE live_activity_tokens
ADD COLUMN IF NOT EXISTS last_pushed_steps INTEGER;

-- Add column to track when we last pushed to the widget
ALTER TABLE live_activity_tokens
ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ;

-- Add device_token column if it doesn't exist (for silent push)
ALTER TABLE live_activity_tokens
ADD COLUMN IF NOT EXISTS device_token TEXT;

-- Comment on the new columns
COMMENT ON COLUMN live_activity_tokens.last_pushed_steps IS 'Last step count pushed to widget (for delta calculation)';
COMMENT ON COLUMN live_activity_tokens.last_push_at IS 'Timestamp of last widget push (for time-based triggers)';
COMMENT ON COLUMN live_activity_tokens.device_token IS 'Native iOS device token for silent push notifications';
