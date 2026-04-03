-- Store encrypted LLM API keys in settings table
ALTER TABLE settings ADD COLUMN IF NOT EXISTS llm_provider VARCHAR(20) DEFAULT 'anthropic';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS llm_api_key_encrypted TEXT DEFAULT NULL;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS encryption_iv TEXT DEFAULT NULL;
