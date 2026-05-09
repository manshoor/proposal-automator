// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { createTemplateSchema, updateTemplateSchema } from '../schemas/template.schema.js';
import * as templateService from '../services/template.service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const templates = await templateService.listTemplates(req.user.id);
  res.json(templates);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const template = await templateService.getTemplate(req.params.id, req.user.id);
  res.json(template);
}));

router.post('/', validate(createTemplateSchema), asyncHandler(async (req, res) => {
  const template = await templateService.createTemplate(req.body, req.user.id);
  res.status(201).json(template);
}));

router.put('/:id', validate(updateTemplateSchema), asyncHandler(async (req, res) => {
  const template = await templateService.updateTemplate(req.params.id, req.body, req.user.id);
  res.json(template);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await templateService.deleteTemplate(req.params.id, req.user.id);
  res.status(204).send();
}));

export default router;