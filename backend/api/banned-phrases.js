import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { createBannedPhraseSchema } from '../schemas/banned-phrases.schema.js';
import * as service from '../services/banned-phrases.service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const phrases = await service.listVisible(req.user.id);
  res.json(phrases);
}));

router.post('/', validate(createBannedPhraseSchema), asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const phrase = await service.create(req.body, req.user.id, isAdmin);
  res.status(201).json(phrase);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const result = await service.remove(req.params.id, req.user.id, isAdmin);
  res.json(result);
}));

export default router;
