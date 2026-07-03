-- =============================================================================
-- Challenge Catalog System
-- Curated, auto-completing challenges with public social discovery.
-- Separate from the user-created `challenges` / `challenge_participants` tables.
-- =============================================================================

-- ---------- challenge_catalog ----------
CREATE TABLE IF NOT EXISTS challenge_catalog (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('run', 'workout', 'streak')),
  subcategory TEXT,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  threshold_type TEXT NOT NULL CHECK (threshold_type IN (
    'run_distance_m_single',
    'run_distance_m_lifetime',
    'run_count',
    'workout_count_by_target',
    'streak_days_any_activity'
  )),
  threshold_value INTEGER NOT NULL,
  workout_target TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cc_category
  ON challenge_catalog(category, display_order);

-- ---------- user_challenge_completions ----------
CREATE TABLE IF NOT EXISTS user_challenge_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES challenge_catalog(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  final_value INTEGER,
  trigger_run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  trigger_workout_id UUID REFERENCES workout_completions(id) ON DELETE SET NULL,
  UNIQUE (user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_ucc_challenge_completed_at
  ON user_challenge_completions(challenge_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ucc_user
  ON user_challenge_completions(user_id);

-- ---------- user_streaks ----------
CREATE TABLE IF NOT EXISTS user_streaks (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_count INTEGER NOT NULL DEFAULT 0,
  best_count INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- RLS ----------
ALTER TABLE challenge_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_challenge_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;

-- Catalog is publicly readable to all authenticated users
DROP POLICY IF EXISTS "Catalog readable by authenticated" ON challenge_catalog;
CREATE POLICY "Catalog readable by authenticated"
  ON challenge_catalog FOR SELECT
  TO authenticated
  USING (TRUE);

-- Completions readable by any authenticated user (public social discovery)
DROP POLICY IF EXISTS "Completions readable by authenticated" ON user_challenge_completions;
CREATE POLICY "Completions readable by authenticated"
  ON user_challenge_completions FOR SELECT
  TO authenticated
  USING (TRUE);

-- Streaks: each user can read their own; backend uses service role for writes
DROP POLICY IF EXISTS "Streaks readable by owner" ON user_streaks;
CREATE POLICY "Streaks readable by owner"
  ON user_streaks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Writes for completions/streaks happen via service role (no policy needed for that)

-- =============================================================================
-- Seed: curated challenge catalog
-- =============================================================================

-- ---------- Runs ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('run_5k',                'run', 'distance',  'First 5K',            'Run 5 kilometers in a single activity.',   '🏃', 'run_distance_m_single',   5000,    10),
  ('run_10k',               'run', 'distance',  'First 10K',           'Run 10 kilometers in a single activity.',  '🏃', 'run_distance_m_single',   10000,   20),
  ('run_half_marathon',     'run', 'distance',  'Half Marathon',       'Run 21.1 kilometers in a single activity.','🏅', 'run_distance_m_single',   21097,   30),
  ('run_marathon',          'run', 'distance',  'Marathon',            'Run 42.2 kilometers in a single activity.','🥇', 'run_distance_m_single',   42195,   40),
  ('run_lifetime_100km',    'run', 'lifetime',  '100 km Lifetime',     'Run 100 km total across all your runs.',   '🛣️', 'run_distance_m_lifetime', 100000,  50),
  ('run_lifetime_500km',    'run', 'lifetime',  '500 km Lifetime',     'Run 500 km total across all your runs.',   '🛣️', 'run_distance_m_lifetime', 500000,  60),
  ('run_lifetime_1000km',   'run', 'lifetime',  '1000 km Lifetime',    'Run 1,000 km total across all your runs.', '🛣️', 'run_distance_m_lifetime', 1000000, 70),
  ('run_count_10',          'run', 'count',     '10 Runs',             'Complete 10 runs.',                        '👟', 'run_count',               10,      80),
  ('run_count_50',          'run', 'count',     '50 Runs',             'Complete 50 runs.',                        '👟', 'run_count',               50,      90),
  ('run_count_100',         'run', 'count',     '100 Runs',            'Complete 100 runs.',                       '👟', 'run_count',               100,     100)
ON CONFLICT (id) DO NOTHING;

-- ---------- Workouts (by body-part target) ----------
-- Abs
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, workout_target, display_order)
VALUES
  ('abs_5',    'workout', 'abs', '5 Abs Workouts',    'Complete 5 abs workouts.',    '🔥', 'workout_count_by_target', 5,   'abs', 110),
  ('abs_10',   'workout', 'abs', '10 Abs Workouts',   'Complete 10 abs workouts.',   '🔥', 'workout_count_by_target', 10,  'abs', 120),
  ('abs_25',   'workout', 'abs', '25 Abs Workouts',   'Complete 25 abs workouts.',   '🔥', 'workout_count_by_target', 25,  'abs', 130),
  ('abs_50',   'workout', 'abs', '50 Abs Workouts',   'Complete 50 abs workouts.',   '🔥', 'workout_count_by_target', 50,  'abs', 140),
  ('abs_100',  'workout', 'abs', '100 Abs Workouts',  'Complete 100 abs workouts.',  '🔥', 'workout_count_by_target', 100, 'abs', 150)
ON CONFLICT (id) DO NOTHING;

-- Legs
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, workout_target, display_order)
VALUES
  ('legs_5',   'workout', 'legs', '5 Leg Workouts',   'Complete 5 leg workouts.',    '🦵', 'workout_count_by_target', 5,   'legs', 160),
  ('legs_10',  'workout', 'legs', '10 Leg Workouts',  'Complete 10 leg workouts.',   '🦵', 'workout_count_by_target', 10,  'legs', 170),
  ('legs_25',  'workout', 'legs', '25 Leg Workouts',  'Complete 25 leg workouts.',   '🦵', 'workout_count_by_target', 25,  'legs', 180),
  ('legs_50',  'workout', 'legs', '50 Leg Workouts',  'Complete 50 leg workouts.',   '🦵', 'workout_count_by_target', 50,  'legs', 190),
  ('legs_100', 'workout', 'legs', '100 Leg Workouts', 'Complete 100 leg workouts.',  '🦵', 'workout_count_by_target', 100, 'legs', 200)
ON CONFLICT (id) DO NOTHING;

-- Upper Body
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, workout_target, display_order)
VALUES
  ('upper_5',   'workout', 'upper_body', '5 Upper-Body Workouts',   'Complete 5 upper-body workouts.',    '💪', 'workout_count_by_target', 5,   'upper_body', 210),
  ('upper_10',  'workout', 'upper_body', '10 Upper-Body Workouts',  'Complete 10 upper-body workouts.',   '💪', 'workout_count_by_target', 10,  'upper_body', 220),
  ('upper_25',  'workout', 'upper_body', '25 Upper-Body Workouts',  'Complete 25 upper-body workouts.',   '💪', 'workout_count_by_target', 25,  'upper_body', 230),
  ('upper_50',  'workout', 'upper_body', '50 Upper-Body Workouts',  'Complete 50 upper-body workouts.',   '💪', 'workout_count_by_target', 50,  'upper_body', 240),
  ('upper_100', 'workout', 'upper_body', '100 Upper-Body Workouts', 'Complete 100 upper-body workouts.',  '💪', 'workout_count_by_target', 100, 'upper_body', 250)
ON CONFLICT (id) DO NOTHING;

-- Full Body
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, workout_target, display_order)
VALUES
  ('full_5',   'workout', 'full_body', '5 Full-Body Workouts',   'Complete 5 full-body workouts.',    '🏋️', 'workout_count_by_target', 5,   'full_body', 260),
  ('full_10',  'workout', 'full_body', '10 Full-Body Workouts',  'Complete 10 full-body workouts.',   '🏋️', 'workout_count_by_target', 10,  'full_body', 270),
  ('full_25',  'workout', 'full_body', '25 Full-Body Workouts',  'Complete 25 full-body workouts.',   '🏋️', 'workout_count_by_target', 25,  'full_body', 280),
  ('full_50',  'workout', 'full_body', '50 Full-Body Workouts',  'Complete 50 full-body workouts.',   '🏋️', 'workout_count_by_target', 50,  'full_body', 290)
ON CONFLICT (id) DO NOTHING;

-- Cardio
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, workout_target, display_order)
VALUES
  ('cardio_5',  'workout', 'cardio', '5 Cardio Workouts',  'Complete 5 cardio workouts.',  '🚴', 'workout_count_by_target', 5,  'cardio', 300),
  ('cardio_10', 'workout', 'cardio', '10 Cardio Workouts', 'Complete 10 cardio workouts.', '🚴', 'workout_count_by_target', 10, 'cardio', 310),
  ('cardio_25', 'workout', 'cardio', '25 Cardio Workouts', 'Complete 25 cardio workouts.', '🚴', 'workout_count_by_target', 25, 'cardio', 320),
  ('cardio_50', 'workout', 'cardio', '50 Cardio Workouts', 'Complete 50 cardio workouts.', '🚴', 'workout_count_by_target', 50, 'cardio', 330)
ON CONFLICT (id) DO NOTHING;

-- Chest
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, workout_target, display_order)
VALUES
  ('chest_5',  'workout', 'chest', '5 Chest Workouts',  'Complete 5 chest workouts.',  '🎯', 'workout_count_by_target', 5,  'chest', 340),
  ('chest_10', 'workout', 'chest', '10 Chest Workouts', 'Complete 10 chest workouts.', '🎯', 'workout_count_by_target', 10, 'chest', 350),
  ('chest_25', 'workout', 'chest', '25 Chest Workouts', 'Complete 25 chest workouts.', '🎯', 'workout_count_by_target', 25, 'chest', 360)
ON CONFLICT (id) DO NOTHING;

-- Back
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, workout_target, display_order)
VALUES
  ('back_5',  'workout', 'back', '5 Back Workouts',  'Complete 5 back workouts.',  '🎯', 'workout_count_by_target', 5,  'back', 370),
  ('back_10', 'workout', 'back', '10 Back Workouts', 'Complete 10 back workouts.', '🎯', 'workout_count_by_target', 10, 'back', 380),
  ('back_25', 'workout', 'back', '25 Back Workouts', 'Complete 25 back workouts.', '🎯', 'workout_count_by_target', 25, 'back', 390)
ON CONFLICT (id) DO NOTHING;

-- Arms
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, workout_target, display_order)
VALUES
  ('arms_5',  'workout', 'arms', '5 Arm Workouts',  'Complete 5 arm workouts.',  '💪', 'workout_count_by_target', 5,  'arms', 400),
  ('arms_10', 'workout', 'arms', '10 Arm Workouts', 'Complete 10 arm workouts.', '💪', 'workout_count_by_target', 10, 'arms', 410),
  ('arms_25', 'workout', 'arms', '25 Arm Workouts', 'Complete 25 arm workouts.', '💪', 'workout_count_by_target', 25, 'arms', 420)
ON CONFLICT (id) DO NOTHING;

-- Shoulders
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, workout_target, display_order)
VALUES
  ('shoulders_5',  'workout', 'shoulders', '5 Shoulder Workouts',  'Complete 5 shoulder workouts.',  '🎯', 'workout_count_by_target', 5,  'shoulders', 430),
  ('shoulders_10', 'workout', 'shoulders', '10 Shoulder Workouts', 'Complete 10 shoulder workouts.', '🎯', 'workout_count_by_target', 10, 'shoulders', 440),
  ('shoulders_25', 'workout', 'shoulders', '25 Shoulder Workouts', 'Complete 25 shoulder workouts.', '🎯', 'workout_count_by_target', 25, 'shoulders', 450)
ON CONFLICT (id) DO NOTHING;

-- Core / Mobility
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, workout_target, display_order)
VALUES
  ('mobility_5',  'workout', 'mobility', '5 Mobility Workouts',  'Complete 5 mobility / flexibility workouts.',  '🧘', 'workout_count_by_target', 5,  'mobility', 460),
  ('mobility_10', 'workout', 'mobility', '10 Mobility Workouts', 'Complete 10 mobility / flexibility workouts.', '🧘', 'workout_count_by_target', 10, 'mobility', 470),
  ('mobility_25', 'workout', 'mobility', '25 Mobility Workouts', 'Complete 25 mobility / flexibility workouts.', '🧘', 'workout_count_by_target', 25, 'mobility', 480)
ON CONFLICT (id) DO NOTHING;

-- ---------- Streaks (any workout or run per calendar day) ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('streak_3',   'streak', NULL, '3-Day Streak',   'Stay active 3 days in a row.',   '🔥', 'streak_days_any_activity', 3,   500),
  ('streak_7',   'streak', NULL, '7-Day Streak',   'Stay active 7 days in a row.',   '🔥', 'streak_days_any_activity', 7,   510),
  ('streak_14',  'streak', NULL, '14-Day Streak',  'Stay active 14 days in a row.',  '🔥', 'streak_days_any_activity', 14,  520),
  ('streak_30',  'streak', NULL, '30-Day Streak',  'Stay active 30 days in a row.',  '🔥', 'streak_days_any_activity', 30,  530),
  ('streak_60',  'streak', NULL, '60-Day Streak',  'Stay active 60 days in a row.',  '🔥', 'streak_days_any_activity', 60,  540),
  ('streak_100', 'streak', NULL, '100-Day Streak', 'Stay active 100 days in a row.', '🔥', 'streak_days_any_activity', 100, 550),
  ('streak_365', 'streak', NULL, '365-Day Streak', 'Stay active 365 days in a row.', '👑', 'streak_days_any_activity', 365, 560)
ON CONFLICT (id) DO NOTHING;
