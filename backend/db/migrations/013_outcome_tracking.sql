-- Proposal outcome tracking and learning engine

-- 1. New outcome columns on proposals
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS response_type VARCHAR(20);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS decline_reason VARCHAR(255);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS client_feedback TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS proposal_length INT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS template_used VARCHAR(255);

-- 2. Proposal insights (learned patterns)
CREATE TABLE IF NOT EXISTS proposal_insights (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  insight_text TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5,
  category VARCHAR(50),
  sample_size INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_user_active ON proposal_insights(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_proposals_response ON proposals(response_type, user_id);
