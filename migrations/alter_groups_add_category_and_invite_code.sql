-- =============================================================================
-- Groups: add `category` + `invite_code`
-- Category-typed groups (steps / running / workouts / nutrition / general)
-- with shareable 8-char invite codes for invite links & QR codes.
-- =============================================================================

-- Add category with safe default
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';

-- Enforce allowed values
ALTER TABLE groups
  DROP CONSTRAINT IF EXISTS groups_category_check;

ALTER TABLE groups
  ADD CONSTRAINT groups_category_check CHECK (category IN (
    'general',
    'steps',
    'running',
    'workouts',
    'nutrition'
  ));

-- Add invite_code (nullable initially so we can backfill, then enforce NOT NULL)
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- Backfill any existing rows with a unique 8-char uppercase hex code
UPDATE groups
SET invite_code = UPPER(SUBSTRING(MD5(id::text || RANDOM()::text), 1, 8))
WHERE invite_code IS NULL;

-- Enforce non-null + uniqueness now that all rows have a value
ALTER TABLE groups
  ALTER COLUMN invite_code SET NOT NULL;

ALTER TABLE groups
  DROP CONSTRAINT IF EXISTS groups_invite_code_key;

ALTER TABLE groups
  ADD CONSTRAINT groups_invite_code_key UNIQUE (invite_code);

-- Indexes used by Browse and join-by-code lookups
CREATE INDEX IF NOT EXISTS idx_groups_browse
  ON groups(category, privacy, member_count DESC)
  WHERE privacy = 'public';

CREATE INDEX IF NOT EXISTS idx_groups_invite_code
  ON groups(invite_code);
