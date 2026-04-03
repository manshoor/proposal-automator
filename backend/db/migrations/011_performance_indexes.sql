-- Performance optimization: composite indexes for common query patterns

-- Proposals: analytics aggregations filter by user_id + status + created_at
CREATE INDEX IF NOT EXISTS idx_proposals_user_status
  ON proposals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_user_created
  ON proposals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_user_status_created
  ON proposals(user_id, status, created_at DESC);

-- Templates: list ordered by created_at per user
CREATE INDEX IF NOT EXISTS idx_templates_user_created
  ON templates(user_id, created_at DESC);

-- Prompts: active prompt lookup by platform per user
CREATE INDEX IF NOT EXISTS idx_prompts_user_platform_active
  ON prompts(user_id, platform, is_active);

-- Projects: featured + recent ordering per user
CREATE INDEX IF NOT EXISTS idx_projects_user_featured_created
  ON projects(user_id, is_featured DESC, created_at DESC);
