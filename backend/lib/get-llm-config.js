import * as settingsRepo from '../repositories/settings.repository.js';
import { cacheGet, cacheSet, cacheDel } from './redis.js';
import { decrypt } from './crypto.js';

const CACHE_TTL = 300; // 5 minutes

function cacheKey(userId) {
  return `llm_config:${userId || 'global'}`;
}

export async function getLLMConfig(userId = null) {
  const key = cacheKey(userId);

  // 1. Check Redis cache
  const cached = await cacheGet(key);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // corrupted cache, continue to DB
    }
  }

  // 2. Fetch from DB via repository (respects user_id scoping)
  const row = await settingsRepo.getLLMConfig(userId);

  if (!row || !row.llm_api_key_encrypted) {
    return { provider: null, apiKey: null };
  }

  const provider = row.llm_provider || 'anthropic';
  const apiKey = decrypt(row.llm_api_key_encrypted, row.encryption_iv);

  // 3. Cache for 5 minutes
  const config = { provider, apiKey };
  await cacheSet(key, JSON.stringify(config), CACHE_TTL);

  return config;
}

export async function invalidateLLMConfig(userId = null) {
  await cacheDel(cacheKey(userId));
}
