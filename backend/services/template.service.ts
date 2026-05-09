import * as templateRepo from '../repositories/template.repository.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';
import { cacheGet, cacheSet, cacheDel } from '../lib/redis.js';

/**
 * Extracts all {variableName} placeholders from a template string.
 *
 * @param {string} content
 * @returns {string[]}
 */
function extractVariables(content) {
  const matches = content.matchAll(/\{(\w+)\}/g);
  return [...new Set([...matches].map(m => m[1]))];
}

/**
 * Returns all templates, ordered by created_at DESC.
 *
 * @param {string|null} userId
 * @returns {Promise<object[]>}
 */
export async function listTemplates(userId = null) {
  const cacheKey = 'templates:' + (userId || 'global');
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const result = await templateRepo.findAll(userId);
  await cacheSet(cacheKey, JSON.stringify(result), 600);
  return result;
}

/**
 * Returns a single template by ID. Throws NotFoundError if missing.
 *
 * @param {string|number} id
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function getTemplate(id, userId = null) {
  const template = await templateRepo.findById(id, userId);
  if (!template) throw new NotFoundError('Template');
  return template;
}

/**
 * Creates a new template, auto-extracting {variable} placeholders from content.
 *
 * @param {object} data  - { name, content, is_default? }
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function createTemplate(data, userId = null) {
  const { name, content, is_default } = data;
  if (!name || !content) {
    throw new ValidationError('name and content are required');
  }

  const variables = extractVariables(content);
  const result = await templateRepo.create({ name, content, variables, is_default: is_default ?? false }, userId);
  await cacheDel('templates:' + (userId || 'global'));
  await cacheDel('bootstrap:' + (userId || 'global'));
  return result;
}

/**
 * Updates a template by ID. Throws NotFoundError if missing.
 * Re-extracts variables from the (possibly updated) content.
 *
 * @param {string|number} id
 * @param {object} data  - { name?, content?, is_default? }
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function updateTemplate(id, data, userId = null) {
  const existing = await templateRepo.findById(id, userId);
  if (!existing) throw new NotFoundError('Template');

  const { name, content, is_default } = data;
  const updatedContent = content ?? existing.content;
  const variables = extractVariables(updatedContent);

  const updated = await templateRepo.update(id, {
    name: name ?? null,
    content: updatedContent,
    variables,
    is_default: is_default ?? null,
  }, userId);

  await cacheDel('templates:' + (userId || 'global'));
  await cacheDel('bootstrap:' + (userId || 'global'));
  return updated;
}

/**
 * Deletes a template by ID. Throws NotFoundError if missing.
 *
 * @param {string|number} id
 * @param {string|null} userId
 * @returns {Promise<void>}
 */
export async function deleteTemplate(id, userId = null) {
  const deleted = await templateRepo.remove(id, userId);
  if (!deleted) throw new NotFoundError('Template');
  await cacheDel('templates:' + (userId || 'global'));
  await cacheDel('bootstrap:' + (userId || 'global'));
}
