-- Prompt admin system: roles + prompt types

-- 1. Add role to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- 2. Add type and is_global to prompts
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'custom';
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Index for prompt resolution queries
CREATE INDEX IF NOT EXISTS idx_prompts_type_global ON prompts(type, is_global, platform, is_active);
