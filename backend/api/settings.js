import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as settingsService from '../services/settings.service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings(req.user.id);
  res.json(settings);
}));

router.put('/', asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req.body, req.user.id);
  res.json(settings);
}));

export default router;
