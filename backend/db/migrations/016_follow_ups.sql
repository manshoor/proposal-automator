-- Phase 4: Follow-Up Engine
CREATE TABLE IF NOT EXISTS proposal_followups (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  message_text TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','sent','cancelled','expired')),
  sequence_index INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_followups_user_status_scheduled
  ON proposal_followups(user_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_followups_proposal
  ON proposal_followups(proposal_id);
