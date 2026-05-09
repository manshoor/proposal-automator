import * as settingsRepo from '../repositories/settings.repository.js';
import { cacheGet, cacheSet, cacheDel } from './redis.js';
import { decrypt } from './crypto.js';
import type { LLMProvider } from './llm.js';

const CACHE_TTL = 300; // 5 minutes

export interface LLMConfig {
  provider: LLMProvider | null;
  apiKey: string | null;
}

function cacheKey(userId: string | null): string {
  return `llm_config:${userId || 'global'}`;
}

export async function getLLMConfig(userId: string | null = null): Promise<LLMConfig> {
  const key = cacheKey(userId);

  // 1. Check Redis cache
  const cached = await cacheGet(key);
  if (cached) {
    try {
      return JSON.parse(cached) as LLMConfig;
    } catch {
      // corrupted cache, continue to DB
    }
  }

  // 2. Fetch from DB via repository (respects user_id scoping). Cast through
  // any: settings.repository.js still emits a JSDoc-only signature that TS
  // narrows incorrectly; will tighten once that file migrates to .ts.
  const row = await (settingsRepo.getLLMConfig as (userId: string | null) => Promise<{
    llm_provider: string | null;
    llm_api_key_encrypted: string | null;
    encryption_iv: string | null;
  } | null>)(userId);

  if (!row || !row.llm_api_key_encrypted) {
    return { provider: null, apiKey: null };
  }

  const provider = (row.llm_provider as LLMProvider) || 'anthropic';
  const apiKey = decrypt(row.llm_api_key_encrypted, row.encryption_iv);

  // 3. Cache for 5 minutes
  const config: LLMConfig = { provider, apiKey };
  await cacheSet(key, JSON.stringify(config), CACHE_TTL);

  return config;
}

export async function invalidateLLMConfig(userId: string | null = null): Promise<void> {
  await cacheDel(cacheKey(userId));
}
