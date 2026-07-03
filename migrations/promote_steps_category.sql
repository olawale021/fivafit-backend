-- =============================================================================
-- Promote Steps to a top-level challenge category
-- =============================================================================

-- Widen the CHECK constraint to allow category='steps'
ALTER TABLE challenge_catalog
  DROP CONSTRAINT IF EXISTS challenge_catalog_category_check;

ALTER TABLE challenge_catalog
  ADD CONSTRAINT challenge_catalog_category_check CHECK (category IN (
    'run',
    'workout',
    'streak',
    'steps'
  ));

-- Move the daily-step rows out of "run" into the new top-level category and
-- split them into proper subcategories so the category screen groups them
-- naturally (Daily / Lifetime / Goal Streak).
-- Run-derived step challenges (subcategory='effort', e.g. step_100k from runs)
-- stay under Runs > Effort because they're sourced from runs.steps, not
-- daily_steps.
UPDATE challenge_catalog
SET category = 'steps', subcategory = 'daily'
WHERE threshold_type = 'step_count_daily_single';

UPDATE challenge_catalog
SET category = 'steps', subcategory = 'lifetime'
WHERE threshold_type = 'step_count_lifetime_daily';

UPDATE challenge_catalog
SET category = 'steps', subcategory = 'goal_streak'
WHERE threshold_type = 'step_count_goal_streak';
