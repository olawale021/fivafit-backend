-- =============================================================================
-- Expand challenge_catalog with the rest of the run achievements
-- (pace, speedster, monthly miles, elevation, calories, steps, weekly freq,
--  consecutive weeks, sunday warrior, weekday warrior, negative splits)
-- =============================================================================

-- Widen the CHECK constraint on threshold_type
ALTER TABLE challenge_catalog
  DROP CONSTRAINT IF EXISTS challenge_catalog_threshold_type_check;

ALTER TABLE challenge_catalog
  ADD CONSTRAINT challenge_catalog_threshold_type_check CHECK (threshold_type IN (
    'run_distance_m_single',
    'run_distance_m_lifetime',
    'run_count',
    'workout_count_by_target',
    'streak_days_any_activity',
    -- new types
    'run_pace_subx',              -- time_seconds threshold at a standard distance_type (stored in workout_target column as the distance type key)
    'run_pace_speedster',         -- avg pace (sec/km) on a single run >= 5km
    'run_monthly_distance',       -- meters in a single calendar month
    'run_elevation_single',       -- elevation_gain_m in a single run
    'run_calories_lifetime',      -- lifetime calories burned in runs
    'run_steps_lifetime',         -- lifetime steps in runs
    'run_runs_per_week',          -- N runs in the same ISO week
    'run_consecutive_weeks',      -- N consecutive weeks with at least 1 run
    'run_sunday_distance',        -- meters in a single run that happens on Sunday
    'run_weekday_warrior',        -- 5 weekday (Mon-Fri) runs in the same ISO week
    'run_negative_splits'         -- single run where back half time < front half (>= 3km)
  ));

-- ---------- Pace Sub-X (use workout_target column to encode pr_distance_type) ----------
-- threshold_value = seconds ceiling. workout_target = '5km' | '10km' | 'half_marathon' | 'marathon'
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, workout_target, display_order)
VALUES
  ('pace_sub_30_5k',       'run', 'pace', 'Sub-30 5K',        'Run a 5K in under 30:00.',          '⏱', 'run_pace_subx', 1800,  '5km',            600),
  ('pace_sub_25_5k',       'run', 'pace', 'Sub-25 5K',        'Run a 5K in under 25:00.',          '⏱', 'run_pace_subx', 1500,  '5km',            610),
  ('pace_sub_60_10k',      'run', 'pace', 'Sub-60 10K',       'Run a 10K in under 60:00.',         '⏱', 'run_pace_subx', 3600,  '10km',           620),
  ('pace_sub_50_10k',      'run', 'pace', 'Sub-50 10K',       'Run a 10K in under 50:00.',         '⏱', 'run_pace_subx', 3000,  '10km',           630),
  ('pace_sub_2h_half',     'run', 'pace', 'Sub-2hr Half',     'Half marathon in under 2:00:00.',   '⏱', 'run_pace_subx', 7200,  'half_marathon',  640),
  ('pace_sub_4h_marathon', 'run', 'pace', 'Sub-4hr Marathon', 'Marathon in under 4:00:00.',        '⏱', 'run_pace_subx', 14400, 'marathon',       650)
ON CONFLICT (id) DO NOTHING;

-- ---------- Speedster (avg pace sec/km on a single run >= 5km) ----------
-- threshold_value = max sec/km (lower is faster)
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('speedster_6_00', 'run', 'pace', 'Sub-6:00 /km', 'Average sub-6:00 /km over a 5K+.', '⚡', 'run_pace_speedster', 360, 660),
  ('speedster_5_00', 'run', 'pace', 'Sub-5:00 /km', 'Average sub-5:00 /km over a 5K+.', '⚡', 'run_pace_speedster', 300, 670),
  ('speedster_4_30', 'run', 'pace', 'Sub-4:30 /km', 'Average sub-4:30 /km over a 5K+.', '⚡', 'run_pace_speedster', 270, 680)
ON CONFLICT (id) DO NOTHING;

-- ---------- Monthly Miles (calendar month tiers) ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('monthly_24',  'run', 'monthly', '24 km Month',  'Run 24 km in a single calendar month.',  '🥉', 'run_monthly_distance', 24000,  700),
  ('monthly_40',  'run', 'monthly', '40 km Month',  'Run 40 km in a single calendar month.',  '🥈', 'run_monthly_distance', 40000,  710),
  ('monthly_80',  'run', 'monthly', '80 km Month',  'Run 80 km in a single calendar month.',  '🥇', 'run_monthly_distance', 80000,  720),
  ('monthly_160', 'run', 'monthly', '160 km Month', 'Run 160 km in a single calendar month.', '💎', 'run_monthly_distance', 160000, 730)
ON CONFLICT (id) DO NOTHING;

-- ---------- Elevation (single-run hill challenges) ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('hill_100', 'run', 'effort', '100m Climb', '100m of elevation gain in one run.', '⛰', 'run_elevation_single', 100, 740),
  ('hill_250', 'run', 'effort', '250m Climb', '250m of elevation gain in one run.', '⛰', 'run_elevation_single', 250, 750),
  ('hill_500', 'run', 'effort', '500m Climb', '500m of elevation gain in one run.', '⛰', 'run_elevation_single', 500, 760)
ON CONFLICT (id) DO NOTHING;

-- ---------- Calories (lifetime) ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('cal_5k',   'run', 'effort', '5,000 Calories',   'Burn 5,000 calories across your runs.',   '🔥', 'run_calories_lifetime', 5000,   770),
  ('cal_25k',  'run', 'effort', '25,000 Calories',  'Burn 25,000 calories across your runs.',  '🔥', 'run_calories_lifetime', 25000,  780),
  ('cal_100k', 'run', 'effort', '100,000 Calories', 'Burn 100,000 calories across your runs.', '🔥', 'run_calories_lifetime', 100000, 790)
ON CONFLICT (id) DO NOTHING;

-- ---------- Steps (lifetime, runs only) ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('step_100k', 'run', 'effort', '100K Steps',    '100,000 steps in your runs.',   '👣', 'run_steps_lifetime', 100000,  800),
  ('step_500k', 'run', 'effort', '500K Steps',    '500,000 steps in your runs.',   '👣', 'run_steps_lifetime', 500000,  810),
  ('step_1m',   'run', 'effort', '1 Million Steps','1,000,000 steps in your runs.', '👣', 'run_steps_lifetime', 1000000, 820)
ON CONFLICT (id) DO NOTHING;

-- ---------- Runs per week (frequency) ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('week_3', 'run', 'frequency', '3 Runs in a Week', 'Run 3 times in the same week.', '📅', 'run_runs_per_week', 3, 830),
  ('week_5', 'run', 'frequency', '5 Runs in a Week', 'Run 5 times in the same week.', '📅', 'run_runs_per_week', 5, 840),
  ('week_7', 'run', 'frequency', '7 Runs in a Week', 'Run every day for a week.',     '📅', 'run_runs_per_week', 7, 850)
ON CONFLICT (id) DO NOTHING;

-- ---------- Consecutive weeks running ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('weeks_4',  'run', 'frequency', '4 Weeks Straight',  'Run at least once every week for 4 weeks.',  '📅', 'run_consecutive_weeks', 4,  860),
  ('weeks_12', 'run', 'frequency', '12 Weeks Straight', 'Run at least once every week for 12 weeks.', '📅', 'run_consecutive_weeks', 12, 870)
ON CONFLICT (id) DO NOTHING;

-- ---------- Sunday Warrior ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('sunday_5',    'run', 'trophy', 'Sunday 5K',    'Run 5 km on a Sunday.',            '☀', 'run_sunday_distance', 5000,  880),
  ('sunday_10',   'run', 'trophy', 'Sunday 10K',   'Run 10 km on a Sunday.',           '☀', 'run_sunday_distance', 10000, 890),
  ('sunday_half', 'run', 'trophy', 'Sunday Half',  'Run a half marathon on a Sunday.', '☀', 'run_sunday_distance', 21097, 900)
ON CONFLICT (id) DO NOTHING;

-- ---------- Weekday Warrior ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('weekday_warrior', 'run', 'trophy', 'Weekday Warrior', 'Run Monday through Friday in the same week.', '🏆', 'run_weekday_warrior', 5, 910)
ON CONFLICT (id) DO NOTHING;

-- ---------- Negative Splits ----------
INSERT INTO challenge_catalog
  (id, category, subcategory, title, description, icon, threshold_type, threshold_value, display_order)
VALUES
  ('negative_splits_5k', 'run', 'trophy', 'Negative Splits', 'Finish a 5K+ with the second half faster.', '📉', 'run_negative_splits', 5000, 920)
ON CONFLICT (id) DO NOTHING;
