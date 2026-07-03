-- =============================================================================
-- Daily step tracking + step-based challenges
-- =============================================================================

-- Daily step records (one row per user per calendar day)
CREATE TABLE IF NOT EXISTS daily_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  step_count INTEGER NOT NULL CHECK (step_count >= 0),
  source TEXT,                                       -- 'healthkit' | 'manual' | 'live_activity'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_steps_user_date
  ON daily_steps(user_id, date DESC);

ALTER TABLE daily_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Daily steps readable by owner" ON daily_steps;
CREATE POLICY "Daily steps readable by owner"
  ON daily_steps FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Widen threshold_type CHECK for the new step categories
ALTER TABLE challenge_catalog
  DROP CONSTRAINT IF EXISTS challenge_catalog_threshold_type_check;

ALTER TABLE challenge_catalog
  ADD CONSTRAINT challenge_catalog_threshold_type_check CHECK (threshold_type IN (
    'run_distance_m_single',
    'run_distance_m_lifetime',
    'run_count',
    'workout_count_by_target',
    'streak_days_any_activity',
    'run_pace_subx',
    'run_pace_speedster',
    'run_monthly_distance',
    'run_elevation_single',
    'run_calories_lifetime',
    'run_steps_lifetime',
    'run_runs_per_week',
    'run_consecutive_weeks',
    'run_sunday_distance',
    'run_weekday_warrior',
    'run_negative_splits',
    -- new step types (sourced from daily_steps table)
    'step_count_daily_single',
    'step_count_lifetime_daily',
    'step_count_goal_streak'
  ));

-- ---------- Daily-single step challenges ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('steps_daily_5k',  'run', 'steps', '5K Step Day',   'Walk 5,000 steps in one day.',  '👣', 'step_count_daily_single', 5000,  930),
  ('steps_daily_10k', 'run', 'steps', '10K Step Day',  'Walk 10,000 steps in one day.', '👣', 'step_count_daily_single', 10000, 940),
  ('steps_daily_15k', 'run', 'steps', '15K Step Day',  'Walk 15,000 steps in one day.', '👣', 'step_count_daily_single', 15000, 950),
  ('steps_daily_20k', 'run', 'steps', '20K Step Day',  'Walk 20,000 steps in one day.', '👣', 'step_count_daily_single', 20000, 960),
  ('steps_daily_25k', 'run', 'steps', '25K Step Day',  'Walk 25,000 steps in one day.', '👣', 'step_count_daily_single', 25000, 970),
  ('steps_daily_50k', 'run', 'steps', '50K Step Day',  'Walk 50,000 steps in one day.', '👣', 'step_count_daily_single', 50000, 975)
ON CONFLICT (id) DO NOTHING;

-- ---------- Lifetime daily-step totals ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('steps_lifetime_250k', 'run', 'steps', '250K Steps',   'Walk 250,000 steps total.',    '🚶', 'step_count_lifetime_daily', 250000,   980),
  ('steps_lifetime_1m',   'run', 'steps', '1M Steps',     'Walk 1,000,000 steps total.',  '🚶', 'step_count_lifetime_daily', 1000000,  990),
  ('steps_lifetime_5m',   'run', 'steps', '5M Steps',     'Walk 5,000,000 steps total.',  '🚶', 'step_count_lifetime_daily', 5000000,  1000),
  ('steps_lifetime_10m',  'run', 'steps', '10M Steps',    'Walk 10,000,000 steps total.', '🚶', 'step_count_lifetime_daily', 10000000, 1010)
ON CONFLICT (id) DO NOTHING;

-- ---------- Personal daily-goal streaks ----------
-- threshold_value = number of consecutive days hitting users.daily_step_goal
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('steps_goal_streak_3',  'run', 'steps', '3-Day Goal Streak',  'Hit your daily step goal 3 days in a row.',  '🎯', 'step_count_goal_streak', 3,  1020),
  ('steps_goal_streak_7',  'run', 'steps', '7-Day Goal Streak',  'Hit your daily step goal 7 days in a row.',  '🎯', 'step_count_goal_streak', 7,  1030),
  ('steps_goal_streak_30', 'run', 'steps', '30-Day Goal Streak', 'Hit your daily step goal 30 days in a row.', '🎯', 'step_count_goal_streak', 30, 1040),
  ('steps_goal_streak_90', 'run', 'steps', '90-Day Goal Streak', 'Hit your daily step goal 90 days in a row.', '🎯', 'step_count_goal_streak', 90, 1050)
ON CONFLICT (id) DO NOTHING;
