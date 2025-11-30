-- Create account_deletions table to track deletion reasons
CREATE TABLE IF NOT EXISTS account_deletions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  username TEXT,
  reason TEXT NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Store user metadata before deletion (optional)
  account_created_at TIMESTAMP WITH TIME ZONE,
  last_login TIMESTAMP WITH TIME ZONE
);

-- Add index on deleted_at for analytics queries
CREATE INDEX idx_account_deletions_deleted_at ON account_deletions(deleted_at);

-- Add index on reason for analytics
CREATE INDEX idx_account_deletions_reason ON account_deletions(reason);

COMMENT ON TABLE account_deletions IS 'Stores information about deleted accounts for analytics and audit purposes';
COMMENT ON COLUMN account_deletions.reason IS 'User-provided reason for account deletion';
