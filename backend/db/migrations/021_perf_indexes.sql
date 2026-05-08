-- Phase 7 perf audit: indexes for nightly workers + hot-path filters.
-- All idempotent (IF NOT EXISTS).

-- B3: Loom cleanup nightly worker — partial index, fast since most rows have NULL.
CREATE INDEX IF NOT EXISTS idx_proposals_loom_url
  ON proposals(loom_url)
  WHERE loom_url IS NOT NULL;

-- B4: Follow-up expiry worker (every 30 min) — current (user_id, status, scheduled_at)
-- index has wrong leading column for this filter.
CREATE INDEX IF NOT EXISTS idx_followups_status_scheduled
  ON proposal_followups(status, scheduled_at);

-- B5: Banned-phrases lookup on every proposal generation.
CREATE INDEX IF NOT EXISTS idx_banned_phrases_active_scope
  ON banned_phrases(active, scope);
