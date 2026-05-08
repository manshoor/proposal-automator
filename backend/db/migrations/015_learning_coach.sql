-- Phase 3: Learning Coach
-- Adds outcome event log, per-user pattern aggregates, client persona reference,
-- and a per-user feature flag for the outcome detector.

-- 1. Feature flag on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS outcome_tracking_enabled BOOLEAN DEFAULT FALSE;

-- 2. Outcome event log (every view / message-thread-open / archive / hire detected)
CREATE TABLE IF NOT EXISTS proposal_outcomes (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER REFERENCES proposals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('viewed','message_thread_opened','archived','hired','replied','interview')),
  source VARCHAR(16) NOT NULL CHECK (source IN ('dom','scrape','manual')),
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proposal_outcomes_proposal ON proposal_outcomes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_outcomes_user_event ON proposal_outcomes(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_proposal_outcomes_occurred ON proposal_outcomes(occurred_at DESC);

-- 3. Per-user pattern aggregates (rolling 90-day computed)
CREATE TABLE IF NOT EXISTS user_patterns (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dimension VARCHAR(32) NOT NULL,        -- 'hook_style' | 'persona' | 'niche'
  key VARCHAR(128) NOT NULL,             -- e.g. 'problem-mirror', 'enterprise-us-high-spend'
  sample_size INTEGER DEFAULT 0,
  win_count INTEGER DEFAULT 0,           -- proposals with replied/interview/hired
  view_count INTEGER DEFAULT 0,          -- proposals with viewed/message_thread_opened
  response_rate NUMERIC(5,4) DEFAULT 0,  -- win_count / sample_size
  view_rate NUMERIC(5,4) DEFAULT 0,      -- view_count / sample_size
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, dimension, key)
);
CREATE INDEX IF NOT EXISTS idx_user_patterns_user_dim ON user_patterns(user_id, dimension);

-- 4. Client persona reference table (rule-based clusters; populated below)
CREATE TABLE IF NOT EXISTS client_personas (
  id SERIAL PRIMARY KEY,
  cluster_id VARCHAR(48) NOT NULL UNIQUE,
  label VARCHAR(128) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO client_personas (cluster_id, label, description) VALUES
  ('enterprise-us-high-spend', 'Enterprise US (high spend)', 'US-based clients with $5K+ spend, payment verified, hire rate >40%. Value quality and reliability.'),
  ('agency-mid-spend',         'Agency / mid-spend',          'Established clients with $1K-$5K spend and steady hire history. Value precision and predictability.'),
  ('new-startup',              'New startup / first-timer',   'Verified clients with low cumulative spend (<$1K) and few or no hires. Need low-risk pitch + tight scope.'),
  ('low-budget-shopper',       'Low-budget shopper',          'Clients with very low budgets and many bids. Filter heavily on price; rarely respond to premium proposals.'),
  ('unverified-risky',         'Unverified / risky',          'Payment unverified, no reviews, or ghost-pattern signals. High proposal-spend risk.')
ON CONFLICT (cluster_id) DO NOTHING;
