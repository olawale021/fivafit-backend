-- ============================================================================
-- Affirmation Schedule Auto-Creation Trigger
-- ============================================================================
-- Creates a trigger to auto-create default affirmation schedule for new users
-- Follows the same pattern as notification_preferences trigger
-- ============================================================================

-- 1. Create trigger function for auto-creation
CREATE OR REPLACE FUNCTION create_default_affirmation_schedule()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO affirmation_schedule (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop existing trigger if present (for idempotency)
DROP TRIGGER IF EXISTS trigger_create_affirmation_schedule ON users;

-- 3. Create trigger that fires after user insert
CREATE TRIGGER trigger_create_affirmation_schedule
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION create_default_affirmation_schedule();

-- 4. Backfill existing users who are missing from affirmation_schedule
INSERT INTO affirmation_schedule (user_id)
SELECT id FROM users
WHERE id NOT IN (SELECT user_id FROM affirmation_schedule)
ON CONFLICT (user_id) DO NOTHING;
