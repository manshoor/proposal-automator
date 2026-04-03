import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as templateService from '../services/template.service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const templates = await templateService.listTemplates();
  res.json(templates);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const template = await templateService.getTemplate(req.params.id);
  res.json(template);
}));

router.post('/', asyncHandler(async (req, res) => {
  const template = await templateService.createTemplate(req.body);
  res.status(201).json(template);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const template = await templateService.updateTemplate(req.params.id, req.body);
  res.json(template);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await templateService.deleteTemplate(req.params.id);
  res.status(204).send();
}));

export default router;
