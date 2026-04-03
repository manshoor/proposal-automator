import * as projectRepo from '../repositories/project.repository.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

/**
 * Returns all projects, with optional category and featured filters.
 *
 * @param {object} query  - { category?, featured? }
 * @param {string|null} userId
 * @returns {Promise<object[]>}
 */
export async function listProjects(query, userId = null) {
  const { category, featured } = query || {};
  return projectRepo.findAll({ category, featured }, userId);
}

/**
 * Returns a single project by ID. Throws NotFoundError if missing.
 *
 * @param {string|number} id
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function getProject(id, userId = null) {
  const project = await projectRepo.findById(id, userId);
  if (!project) throw new NotFoundError('Project');
  return project;
}

/**
 * Creates a new project. Requires name.
 *
 * @param {object} data
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function createProject(data, userId = null) {
  const { name } = data;
  if (!name) throw new ValidationError('name is required');
  return projectRepo.create(data, userId);
}

/**
 * Updates a project by ID. Throws NotFoundError if missing.
 *
 * @param {string|number} id
 * @param {object} data
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function updateProject(id, data, userId = null) {
  const updated = await projectRepo.update(id, data, userId);
  if (!updated) throw new NotFoundError('Project');
  return updated;
}

/**
 * Deletes a project by ID. Throws NotFoundError if missing.
 *
 * @param {string|number} id
 * @param {string|null} userId
 * @returns {Promise<void>}
 */
export async function deleteProject(id, userId = null) {
  const deleted = await projectRepo.remove(id, userId);
  if (!deleted) throw new NotFoundError('Project');
}
