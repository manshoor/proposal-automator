import * as promptRepo from '../repositories/prompt.repository.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

/**
 * Returns all prompts with optional platform and active filters.
 *
 * @param {object} query  - { platform?, active? }
 * @param {string|null} userId
 * @returns {Promise<object[]>}
 */
export async function listPrompts(query, userId = null) {
  const { platform, active } = query || {};
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
  return promptRepo.findActiveForPlatform(platform, userId);
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
  return promptRepo.create(data, userId);
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
}
