ALTER TABLE proposals ADD COLUMN IF NOT EXISTS client_identity_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_proposals_client_hash
  ON proposals(user_id, client_identity_hash)
  WHERE client_identity_hash IS NOT NULL;
