-- Create table for storing Live Activity push tokens
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS live_activity_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  push_token TEXT NOT NULL,
  last_steps INTEGER,
  last_goal INTEGER,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_live_activity_tokens_user_id ON live_activity_tokens(user_id);

-- Enable RLS
ALTER TABLE live_activity_tokens ENABLE ROW LEVEL SECURITY;

-- Allow users to read/write their own tokens
CREATE POLICY "Users can manage their own tokens"
  ON live_activity_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow service role to manage all tokens (for backend)
CREATE POLICY "Service role can manage all tokens"
  ON live_activity_tokens
  FOR ALL
  USING (auth.role() = 'service_role');
