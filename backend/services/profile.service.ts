// @ts-nocheck — TODO: tighten types in a follow-up iter
import * as profileRepo from '../repositories/profile.repository.js';
import { cacheGet, cacheSet, cacheDel } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

const DEFAULT_PROFILE = {
  id: null,
  full_name: '',
  title: '',
  summary: '',
  skills: [],
  experience: '',
  portfolio: '',
  default_hourly_rate: 50.0,
};

// Module-local cache so repeated same-process lookups (every proposal generation)
// don't hit Redis. TTL matches the Redis TTL.
const LOCAL_CACHE_TTL_MS = 5 * 60 * 1000;
const localCache = new Map();

/**
 * Returns the first profile, auto-creating a default row if none exists.
 * Result is cached locally (5 min) and in Redis (5 min).
 *
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function getProfile(userId = null) {
  const cacheKey = `profile:${userId || 'global'}`;

  const localHit = localCache.get(cacheKey);
  if (localHit && localHit.expiresAt > Date.now()) {
    return localHit.value;
  }

  const cached = await cacheGet(cacheKey);
  if (cached) {
    const value = JSON.parse(cached);
    localCache.set(cacheKey, { value, expiresAt: Date.now() + LOCAL_CACHE_TTL_MS });
    return value;
  }

  let profile = await profileRepo.findFirst(userId);
  if (!profile) {
    profile = await profileRepo.create({
      full_name: '',
      title: '',
      summary: '',
      skills: [],
      experience: '',
      portfolio: '',
      default_hourly_rate: 50.0,
    }, userId);
  }

  await cacheSet(cacheKey, JSON.stringify(profile), 300);
  localCache.set(cacheKey, { value: profile, expiresAt: Date.now() + LOCAL_CACHE_TTL_MS });
  return profile;
}

/**
 * Non-fatal version for LLM endpoints.
 * Returns DEFAULT_PROFILE on any error so generation can continue.
 *
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function getProfileOrDefault(userId = null) {
  try {
    return await getProfile(userId);
  } catch (err) {
    logger.warn({ err: err?.message, userId }, 'Profile fetch failed; using default');
    return DEFAULT_PROFILE;
  }
}

/**
 * Upserts the profile and invalidates the cache.
 *
 * @param {object} data
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function updateProfile(data, userId = null) {
  let profile = await profileRepo.findFirst(userId);
  if (!profile) {
    profile = await profileRepo.create(data, userId);
  } else {
    profile = await profileRepo.update(profile.id, data, userId);
  }
  await cacheDel(`profile:${userId || 'global'}`);
  await cacheDel(`bootstrap:${userId || 'global'}`);
  localCache.delete(`profile:${userId || 'global'}`);
  return profile;
}