import pool from '../db/pool.js';
import { cacheGet, cacheSet, cacheDel } from './redis.js';
import { decrypt } from './crypto.js';

const CACHE_KEY = 'llm_config';
const CACHE_TTL = 300; // 5 minutes

export async function getLLMConfig() {
  // 1. Check Redis cache
  const cached = await cacheGet(CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // corrupted cache, continue to DB
    }
  }

  // 2. Fetch from DB
  const { rows } = await pool.query(
    'SELECT llm_provider, llm_api_key_encrypted, encryption_iv FROM settings LIMIT 1'
  );

  if (!rows.length || !rows[0].llm_api_key_encrypted) {
    return { provider: null, apiKey: null };
  }

  const provider = rows[0].llm_provider || 'anthropic';
  const apiKey = decrypt(rows[0].llm_api_key_encrypted, rows[0].encryption_iv);

  // 3. Cache for 5 minutes
  const config = { provider, apiKey };
  await cacheSet(CACHE_KEY, JSON.stringify(config), CACHE_TTL);

  return config;
}

export async function invalidateLLMConfig() {
  await cacheDel(CACHE_KEY);
}
