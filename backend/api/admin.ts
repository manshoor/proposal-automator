// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as promptRepo from '../repositories/prompt.repository.js';
import * as userRepo from '../repositories/user.repository.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

const router = Router();

// ---- Global Prompts ----

router.get('/prompts', asyncHandler(async (req, res) => {
  const prompts = await promptRepo.findAllGlobal();
  res.json(prompts);
}));

router.post('/prompts', asyncHandler(async (req, res) => {
  const { name, platform, prompt_text, type, is_active } = req.body;
  if (!name || !prompt_text) {
    throw new ValidationError('name and prompt_text are required');
  }
  const prompt = await promptRepo.create({
    name,
    platform: platform || 'all',
    prompt_text,
    is_active: is_active !== false,
    type: type || 'system',
    is_global: true,
  }, req.user.id);
  res.status(201).json(prompt);
}));

router.put('/prompts/:id', asyncHandler(async (req, res) => {
  const prompt = await promptRepo.update(req.params.id, req.body);
  if (!prompt) throw new NotFoundError('Prompt');
  res.json(prompt);
}));

router.delete('/prompts/:id', asyncHandler(async (req, res) => {
  const ok = await promptRepo.remove(req.params.id);
  if (!ok) throw new NotFoundError('Prompt');
  res.json({ success: true });
}));

// ---- User Management ----

router.get('/users', asyncHandler(async (req, res) => {
  const users = await userRepo.findAll();
  res.json(users);
}));

router.put('/users/:id/role', asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!role || !['user', 'admin'].includes(role)) {
    throw new ValidationError('role must be "user" or "admin"');
  }
  const user = await userRepo.updateRole(req.params.id, role);
  if (!user) throw new NotFoundError('User');
  res.json(user);
}));

export default router;