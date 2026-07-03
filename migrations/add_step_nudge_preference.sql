-- Toggle for the step-goal pace notifications (nudge when behind pace + evening
-- affirmation when on pace). Enabled by default. Required by the
-- scheduleStepGoalPaceCheck cron in cronService.js.
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS step_nudge_enabled BOOLEAN DEFAULT true;
