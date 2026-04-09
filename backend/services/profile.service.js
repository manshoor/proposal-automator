import * as profileRepo from '../repositories/profile.repository.js';
import { cacheGet, cacheSet, cacheDel } from '../lib/redis.js';

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

/**
 * Returns the first profile, auto-creating a default row if none exists.
 * Result is cached in Redis for 5 minutes.
 *
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function getProfile(userId = null) {
  const cacheKey = `profile:${userId || 'global'}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

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
  } catch {
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
  return profile;
}
