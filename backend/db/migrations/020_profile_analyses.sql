CREATE TABLE IF NOT EXISTS profile_analyses (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  overall_score INTEGER,
  headline_score INTEGER,
  summary_score INTEGER,
  skills_score INTEGER,
  rate_score INTEGER,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profile_analyses_user_created
  ON profile_analyses(user_id, created_at DESC);
