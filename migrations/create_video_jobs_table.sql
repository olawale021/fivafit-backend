-- ============================================
-- Table: video_jobs
-- Async render jobs for 3D run replay videos
-- ============================================
CREATE TABLE IF NOT EXISTS video_jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id            UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  request_data      JSONB,
  result_data       JSONB,
  progress          INTEGER DEFAULT 0,
  error_message     TEXT,
  notification_sent BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_user_id ON video_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_video_jobs_run_status ON video_jobs(run_id, status);

-- One active (pending/processing) job per run — DB-level dedupe guard
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_jobs_one_active_per_run
  ON video_jobs(run_id)
  WHERE status IN ('pending', 'processing');

-- Service-role access only (matches generation_jobs usage pattern)
ALTER TABLE video_jobs DISABLE ROW LEVEL SECURITY;
