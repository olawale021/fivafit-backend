-- Migration: Add UGC Safety Tables for App Store Guideline 1.2 Compliance
-- This adds tables for EULA tracking, user blocking, content reports, and keyword filtering

-- 1. EULA Acceptance Tracking
CREATE TABLE IF NOT EXISTS user_eula_acceptances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  eula_version VARCHAR(20) NOT NULL DEFAULT '1.0',
  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address VARCHAR(45),
  device_info JSONB,

  UNIQUE(user_id, eula_version)
);

CREATE INDEX IF NOT EXISTS idx_user_eula_user_id ON user_eula_acceptances(user_id);

COMMENT ON TABLE user_eula_acceptances IS 'Tracks user acceptance of EULA/Terms of Service by version';

-- 2. User Blocks
CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

COMMENT ON TABLE user_blocks IS 'Stores user block relationships for content filtering';

-- 3. Content Reports
CREATE TABLE IF NOT EXISTS content_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  comment_id UUID REFERENCES post_comments(id) ON DELETE SET NULL,
  report_type VARCHAR(50) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT valid_report_type CHECK (report_type IN ('spam', 'harassment', 'hate_speech', 'violence', 'nudity', 'self_harm', 'impersonation', 'other')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  CONSTRAINT at_least_one_target CHECK (
    reported_user_id IS NOT NULL OR post_id IS NOT NULL OR comment_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_reporter ON content_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_created ON content_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_reports_pending ON content_reports(created_at) WHERE status = 'pending';

COMMENT ON TABLE content_reports IS 'User-submitted reports of objectionable content for moderation';
COMMENT ON COLUMN content_reports.report_type IS 'Category of violation: spam, harassment, hate_speech, violence, nudity, self_harm, impersonation, other';
COMMENT ON COLUMN content_reports.status IS 'Moderation status: pending, reviewed, resolved, dismissed';

-- 4. Content Filter Keywords (admin-managed blocklist)
CREATE TABLE IF NOT EXISTS content_filter_keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword VARCHAR(100) NOT NULL UNIQUE,
  severity VARCHAR(20) DEFAULT 'moderate',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_severity CHECK (severity IN ('low', 'moderate', 'high'))
);

CREATE INDEX IF NOT EXISTS idx_content_filter_active ON content_filter_keywords(is_active) WHERE is_active = true;

COMMENT ON TABLE content_filter_keywords IS 'Keyword blocklist for automated content filtering';
COMMENT ON COLUMN content_filter_keywords.severity IS 'Severity level: low (warn), moderate (block), high (block + flag)';

-- Insert default objectionable keywords (can be expanded by admin)
INSERT INTO content_filter_keywords (keyword, severity) VALUES
  ('kill yourself', 'high'),
  ('kys', 'high'),
  ('nigger', 'high'),
  ('faggot', 'high'),
  ('retard', 'moderate'),
  ('fuck you', 'moderate'),
  ('go die', 'high')
ON CONFLICT (keyword) DO NOTHING;

-- 5. Add EULA columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS eula_accepted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS eula_version VARCHAR(20);

COMMENT ON COLUMN users.eula_accepted_at IS 'When user accepted the current EULA version';
COMMENT ON COLUMN users.eula_version IS 'EULA version the user accepted';
