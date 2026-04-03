-- Phase 3: Users table and multi-tenancy

-- 1. Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Default user for existing data migration
INSERT INTO users (id, email, password_hash, full_name)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'default@localhost',
  '$2b$10$F4YRuJ8cuPFrg1HOytd6JeqDrU9nC95qio.akaEbFkc.OibnnYYFm',
  'Default User'
) ON CONFLICT (email) DO NOTHING;

-- 3. Add user_id to all content tables, backfill, add FK + index

-- profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_id UUID;
UPDATE profiles SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
ALTER TABLE profiles ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE profiles ADD CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- proposals
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS user_id UUID;
UPDATE proposals SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
ALTER TABLE proposals ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE proposals ADD CONSTRAINT fk_proposals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_proposals_user_id ON proposals(user_id);

-- templates
ALTER TABLE templates ADD COLUMN IF NOT EXISTS user_id UUID;
UPDATE templates SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
ALTER TABLE templates ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE templates ADD CONSTRAINT fk_templates_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);

-- settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id UUID;
UPDATE settings SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
ALTER TABLE settings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE settings ADD CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);

-- projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id UUID;
UPDATE projects SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- prompts
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS user_id UUID;
UPDATE prompts SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
ALTER TABLE prompts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE prompts ADD CONSTRAINT fk_prompts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);

-- 4. Refresh tokens table for JWT
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
