-- ============================================================================
-- PHASE 1: Workout Notifications System - Database Schema Updates
-- ============================================================================
-- This migration extends the existing notifications system to support:
-- - Workout-specific notifications (separate from social)
-- - Push notification tracking
-- - User notification preferences
-- - System-generated notifications (no actor)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Update existing notifications table
-- ----------------------------------------------------------------------------

-- Make actor_id nullable for system-generated notifications (workout reminders, etc)
ALTER TABLE notifications
ALTER COLUMN actor_id DROP NOT NULL;

-- Add metadata column for workout-specific data (JSON format)
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add category to separate social vs workout notifications
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS notification_category VARCHAR(20) DEFAULT 'social';

-- Add push notification tracking
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS push_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMP WITH TIME ZONE;

-- Add comment to explain category values
COMMENT ON COLUMN notifications.notification_category IS 'Values: social (like, comment, reply, follow) or workout (reminders, achievements, reports)';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notifications_category_user
ON notifications(notification_category, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type
ON notifications(type);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
ON notifications(user_id, is_read, notification_category);

-- ----------------------------------------------------------------------------
-- 2. Add push notification fields to users table
-- ----------------------------------------------------------------------------

ALTER TABLE users
ADD COLUMN IF NOT EXISTS push_token VARCHAR(255);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN DEFAULT TRUE;

-- Create index for push token lookups
CREATE INDEX IF NOT EXISTS idx_users_push_token
ON users(push_token)
WHERE push_token IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Create notification_preferences table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Global toggles
  push_enabled BOOLEAN DEFAULT TRUE,
  in_app_enabled BOOLEAN DEFAULT TRUE,

  -- Workout reminders
  daily_reminder_enabled BOOLEAN DEFAULT TRUE,
  daily_reminder_time TIME DEFAULT '08:00:00',
  upcoming_reminder_enabled BOOLEAN DEFAULT TRUE,
  upcoming_reminder_minutes INTEGER DEFAULT 60,  -- 1 hour before
  missed_reminder_enabled BOOLEAN DEFAULT TRUE,
  rest_day_reminder_enabled BOOLEAN DEFAULT TRUE,

  -- Achievements
  workout_completed_enabled BOOLEAN DEFAULT TRUE,
  weekly_goal_enabled BOOLEAN DEFAULT TRUE,
  monthly_milestone_enabled BOOLEAN DEFAULT TRUE,

  -- Plan updates
  plan_generated_enabled BOOLEAN DEFAULT TRUE,

  -- Insights & re-engagement
  weekly_report_enabled BOOLEAN DEFAULT TRUE,
  weekly_report_day INTEGER DEFAULT 0,  -- 0 = Sunday
  weekly_report_time TIME DEFAULT '18:00:00',
  inactive_alert_enabled BOOLEAN DEFAULT TRUE,
  inactive_alert_days INTEGER DEFAULT 3,
  recovery_reminder_enabled BOOLEAN DEFAULT TRUE,

  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME DEFAULT '22:00:00',
  quiet_hours_end TIME DEFAULT '07:00:00',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for user lookup
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
ON notification_preferences(user_id);

-- Add comments for documentation
COMMENT ON TABLE notification_preferences IS 'User preferences for workout notification types, timing, and quiet hours';
COMMENT ON COLUMN notification_preferences.daily_reminder_time IS 'Time of day to send daily workout reminder (e.g., 08:00:00)';
COMMENT ON COLUMN notification_preferences.upcoming_reminder_minutes IS 'Minutes before workout to send reminder (default: 60 = 1 hour)';
COMMENT ON COLUMN notification_preferences.inactive_alert_days IS 'Days of inactivity before sending alert (default: 3)';
COMMENT ON COLUMN notification_preferences.weekly_report_day IS 'Day of week for report: 0=Sunday, 1=Monday, etc';

-- ----------------------------------------------------------------------------
-- 4. Create trigger to create default preferences for new users
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;  -- Skip if already exists
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_notification_preferences ON users;

CREATE TRIGGER trigger_create_notification_preferences
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION create_default_notification_preferences();

-- ----------------------------------------------------------------------------
-- 5. Backfill notification preferences for existing users
-- ----------------------------------------------------------------------------

INSERT INTO notification_preferences (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Summary of changes:
-- ✓ Updated notifications table with metadata, category, push tracking
-- ✓ Made actor_id nullable for system notifications
-- ✓ Added push_token fields to users table
-- ✓ Created notification_preferences table with all settings
-- ✓ Created trigger for auto-creating preferences on user signup
-- ✓ Backfilled preferences for existing users
-- ✓ Added performance indexes
-- ============================================================================
