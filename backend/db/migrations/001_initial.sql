CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) DEFAULT '',
  title VARCHAR(255) DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  skills TEXT[] DEFAULT '{}',
  experience TEXT NOT NULL DEFAULT '',
  portfolio TEXT NOT NULL DEFAULT '',
  default_hourly_rate DECIMAL(10,2) DEFAULT 50.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposals (
  id SERIAL PRIMARY KEY,
  job_url VARCHAR(500) NOT NULL,
  job_title VARCHAR(500) NOT NULL,
  job_description TEXT,
  job_budget_type VARCHAR(20),
  job_budget_min DECIMAL(10,2),
  job_budget_max DECIMAL(10,2),
  job_budget_amount DECIMAL(10,2),
  job_skills TEXT[] DEFAULT '{}',
  client_location VARCHAR(255),
  client_total_spent VARCHAR(100),
  client_hire_rate VARCHAR(50),
  client_review_count INTEGER,
  proposal_text TEXT NOT NULL,
  hourly_rate DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'pending', 'hired', 'rejected', 'withdrawn')),
  hidden_instructions TEXT,
  vetting_result JSONB,
  proposal_count VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON proposals(created_at);
CREATE INDEX IF NOT EXISTS idx_proposals_job_url ON proposals(job_url);
