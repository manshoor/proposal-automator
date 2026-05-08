-- Phase 1: Hook Surgeon
-- Adds hook_style label on proposals + banned_phrases table for hook validation.

-- 1. Hook style on proposals (records which style produced the proposal)
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS hook_style VARCHAR(32);

-- 2. Banned phrases table
CREATE TABLE IF NOT EXISTS banned_phrases (
  id SERIAL PRIMARY KEY,
  scope VARCHAR(16) NOT NULL CHECK (scope IN ('system','admin','user')),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('block','warn')),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banned_phrases_scope_active ON banned_phrases(scope, active);
CREATE INDEX IF NOT EXISTS idx_banned_phrases_user ON banned_phrases(user_id);

-- 3. Seed system phrases (block = blocks submission, warn = surfaced as issue)
INSERT INTO banned_phrases (scope, phrase, severity) VALUES
  ('system', 'I''d be delighted', 'block'),
  ('system', 'I would be delighted', 'block'),
  ('system', 'perfectly aligns', 'block'),
  ('system', 'leverage my expertise', 'block'),
  ('system', 'leverage my skills', 'block'),
  ('system', 'I''m excited about', 'block'),
  ('system', 'I am excited about', 'block'),
  ('system', 'I noticed you', 'block'),
  ('system', 'I noticed your', 'block'),
  ('system', 'I see you''re looking', 'block'),
  ('system', 'I see you are looking', 'block'),
  ('system', 'Dear Hiring Manager', 'block'),
  ('system', 'Dear Sir or Madam', 'block'),
  ('system', 'I hope this message finds you well', 'block'),
  ('system', 'looking forward to hearing from you', 'block'),
  ('system', 'as a skilled', 'block'),
  ('system', 'as an experienced', 'block'),
  ('system', 'as a seasoned', 'block'),
  ('system', 'I''d love to help', 'block'),
  ('system', 'I would love to help', 'block'),
  ('system', 'It would be my pleasure', 'block'),
  ('system', 'Please feel free to', 'warn'),
  ('system', 'passion for', 'warn'),
  ('system', 'passionate about', 'warn'),
  ('system', 'results-driven', 'warn'),
  ('system', 'detail-oriented', 'warn'),
  ('system', 'team player', 'warn'),
  ('system', 'self-starter', 'warn'),
  ('system', 'go-getter', 'warn'),
  ('system', 'think outside the box', 'warn'),
  ('system', 'synergy', 'warn'),
  ('system', 'cutting-edge', 'warn'),
  ('system', 'state-of-the-art', 'warn'),
  ('system', 'best-in-class', 'warn'),
  ('system', 'world-class', 'warn'),
  ('system', 'one-stop shop', 'warn'),
  ('system', 'win-win', 'warn'),
  ('system', 'value-add', 'warn'),
  ('system', 'paradigm shift', 'warn'),
  ('system', 'next-level', 'warn'),
  ('system', 'going above and beyond', 'warn'),
  ('system', 'hit the ground running', 'warn'),
  ('system', 'comprehensive solution', 'warn'),
  ('system', 'strategic partnership', 'warn')
ON CONFLICT DO NOTHING;
