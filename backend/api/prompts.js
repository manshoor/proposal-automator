import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as promptService from '../services/prompt.service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const prompts = await promptService.listPrompts(req.query, req.user.id);
  res.json(prompts);
}));

router.get('/active/:platform', asyncHandler(async (req, res) => {
  const prompt = await promptService.getActivePrompt(req.params.platform, req.user.id);
  res.json(prompt);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const prompt = await promptService.getPrompt(req.params.id, req.user.id);
  res.json(prompt);
}));

router.post('/', asyncHandler(async (req, res) => {
  const prompt = await promptService.createPrompt(req.body, req.user.id);
  res.status(201).json(prompt);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const prompt = await promptService.updatePrompt(req.params.id, req.body, req.user.id);
  res.json(prompt);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await promptService.deletePrompt(req.params.id, req.user.id);
  res.json(result);
}));

export default router;
