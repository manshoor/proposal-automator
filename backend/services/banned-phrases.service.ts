import * as repo from '../repositories/banned-phrases.repository.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

export async function listVisible(userId) {
  return repo.findVisible(userId);
}

export async function listActiveForUser(userId) {
  return repo.findActiveForUser(userId);
}

export async function create(input, userId, isAdmin) {
  const { phrase, severity, scope } = input;
  if (scope === 'admin' && !isAdmin) {
    throw new ValidationError('Only admins can create admin-scoped phrases');
  }
  const ownerId = scope === 'user' ? userId : null;
  return repo.create({ scope, userId: ownerId, phrase, severity });
}

export async function remove(id, userId, isAdmin) {
  const ok = await repo.remove(id, userId, isAdmin);
  if (!ok) throw new NotFoundError('Banned phrase');
  return { success: true };
}
