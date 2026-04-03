import * as settingsRepo from '../repositories/settings.repository.js';
import { encrypt } from '../lib/crypto.js';
import { invalidateLLMConfig } from '../lib/get-llm-config.js';
import { cacheDel } from '../lib/redis.js';

/**
 * Returns settings, auto-creating defaults if no row exists yet.
 * The raw encrypted API key is masked before returning.
 *
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function getSettings(userId = null) {
  let settings = await settingsRepo.findFirst(userId);
  if (!settings) {
    await settingsRepo.ensureExists(userId);
    settings = await settingsRepo.findFirst(userId);
  }
  return maskApiKey(settings);
}

/**
 * Updates settings, encrypting the API key if provided, then invalidates caches.
 *
 * @param {object} data  - The full settings payload from the request body
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function updateSettings(data, userId = null) {
  await settingsRepo.ensureExists(userId);

  let encryptedKey;
  let iv;
  if (data.llm_api_key) {
    const result = encrypt(data.llm_api_key);
    encryptedKey = result.encrypted;
    iv = result.iv;
  }

  const settings = await settingsRepo.update({
    ...data,
    llm_api_key_encrypted: encryptedKey || undefined,
    encryption_iv: iv || undefined,
  }, userId);

  await invalidateLLMConfig();
  await cacheDel('settings');

  return maskApiKey(settings);
}

/**
 * Masks the encrypted API key so it is never returned to callers.
 * Mutates and returns the settings object.
 *
 * @param {object} settings
 * @returns {object}
 */
function maskApiKey(settings) {
  if (settings.llm_api_key_encrypted) {
    settings.llm_api_key_masked = '****' + settings.llm_api_key_encrypted.slice(-8);
    settings.llm_api_key_set = true;
  } else {
    settings.llm_api_key_masked = null;
    settings.llm_api_key_set = false;
  }
  delete settings.llm_api_key_encrypted;
  delete settings.encryption_iv;
  return settings;
}
