-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Table: runs
-- Stores completed running activities
-- ============================================
CREATE TABLE IF NOT EXISTS runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at        TIMESTAMPTZ NOT NULL,
  finished_at       TIMESTAMPTZ,
  duration_seconds  INTEGER,
  distance_meters   FLOAT,
  avg_pace_sec_km   INTEGER,
  best_pace_sec_km  INTEGER,
  calories_burned   FLOAT,
  avg_speed_ms      FLOAT,
  max_speed_ms      FLOAT,
  elevation_gain_m  FLOAT,
  avg_cadence       FLOAT,
  status            TEXT DEFAULT 'completed',
  route_polyline    JSONB,
  splits            JSONB,
  cheat_flags       JSONB,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_runs_user_started ON runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_user_status ON runs(user_id, status);

-- ============================================
-- Table: personal_bests
-- Stores best times for standard distances
-- ============================================
CREATE TABLE IF NOT EXISTS personal_bests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  distance_type   TEXT NOT NULL,
  time_seconds    INTEGER NOT NULL,
  pace_sec_km     INTEGER,
  run_id          UUID REFERENCES runs(id) ON DELETE SET NULL,
  achieved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, distance_type)
);

CREATE INDEX IF NOT EXISTS idx_personal_bests_user ON personal_bests(user_id);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_bests ENABLE ROW LEVEL SECURITY;

-- Runs: users can only see/modify their own runs
CREATE POLICY "Users can view own runs" ON runs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own runs" ON runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own runs" ON runs
  FOR DELETE USING (auth.uid() = user_id);

-- Personal Bests: users can view anyone's PBs but only modify their own
CREATE POLICY "Anyone can view personal bests" ON personal_bests
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own personal bests" ON personal_bests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own personal bests" ON personal_bests
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role bypass (for backend)
CREATE POLICY "Service role full access runs" ON runs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access personal_bests" ON personal_bests
  FOR ALL USING (auth.role() = 'service_role');
