import * as promptRepo from '../repositories/prompt.repository.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';
import { cacheGet, cacheSet, cacheDel } from '../lib/redis.js';

/**
 * Returns all prompts with optional platform and active filters.
 *
 * @param {object} query  - { platform?, active? }
 * @param {string|null} userId
 * @returns {Promise<object[]>}
 */
export async function listPrompts(query, userId = null) {
  const { platform, active } = query || {};

  if (!platform && !active) {
    const cacheKey = 'prompts:' + (userId || 'global');
    const cached = await cacheGet(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await promptRepo.findAll({ platform, active }, userId);
    await cacheSet(cacheKey, JSON.stringify(result), 600);
    return result;
  }

  return promptRepo.findAll({ platform, active }, userId);
}

/**
 * Returns the active prompt for a given platform.
 * Tries platform-specific first, then falls back to the 'all' master prompt.
 * Returns null if none exists.
 *
 * @param {string} platform
 * @param {string|null} userId
 * @returns {Promise<object|null>}
 */
export async function getActivePrompt(platform, userId = null) {
  const cacheKey = 'prompt:active:' + (userId || 'global') + ':' + platform;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const result = await promptRepo.findActiveForPlatform(platform, userId);
  await cacheSet(cacheKey, JSON.stringify(result), 600);
  return result;
}

/**
 * Returns a single prompt by ID. Throws NotFoundError if missing.
 *
 * @param {string|number} id
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function getPrompt(id, userId = null) {
  const prompt = await promptRepo.findById(id, userId);
  if (!prompt) throw new NotFoundError('Prompt');
  return prompt;
}

/**
 * Creates a new prompt. Requires name and prompt_text.
 *
 * @param {object} data  - { name, platform?, prompt_text, is_active? }
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function createPrompt(data, userId = null) {
  const { name, prompt_text } = data;
  if (!name || !prompt_text) {
    throw new ValidationError('name and prompt_text are required');
  }
  const result = await promptRepo.create(data, userId);
  const uid = userId || 'global';
  await Promise.all([
    cacheDel('prompts:' + uid),
    cacheDel('prompt:active:' + uid + ':upwork'),
    cacheDel('prompt:active:' + uid + ':all'),
    cacheDel('prompt:active:' + uid + ':fiverr'),
  ]);
  return result;
}

/**
 * Updates a prompt by ID. Throws NotFoundError if missing.
 *
 * @param {string|number} id
 * @param {object} data
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function updatePrompt(id, data, userId = null) {
  const updated = await promptRepo.update(id, data, userId);
  if (!updated) throw new NotFoundError('Prompt');
  const uid = userId || 'global';
  await Promise.all([
    cacheDel('prompts:' + uid),
    cacheDel('prompt:active:' + uid + ':upwork'),
    cacheDel('prompt:active:' + uid + ':all'),
    cacheDel('prompt:active:' + uid + ':fiverr'),
  ]);
  return updated;
}

/**
 * Deletes a prompt by ID.
 * Throws ValidationError if the prompt is marked as default (protected).
 * Throws NotFoundError if missing.
 *
 * @param {string|number} id
 * @param {string|null} userId
 * @returns {Promise<void>}
 */
export async function deletePrompt(id, userId = null) {
  const existing = await promptRepo.findById(id, userId);
  if (existing && existing.is_default) {
    throw new ValidationError('Cannot delete the default prompt');
  }
  const deleted = await promptRepo.remove(id, userId);
  if (!deleted) throw new NotFoundError('Prompt');
  const uid = userId || 'global';
  await Promise.all([
    cacheDel('prompts:' + uid),
    cacheDel('prompt:active:' + uid + ':upwork'),
    cacheDel('prompt:active:' + uid + ':all'),
    cacheDel('prompt:active:' + uid + ':fiverr'),
  ]);
}
