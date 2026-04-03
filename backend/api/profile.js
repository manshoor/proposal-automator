import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as profileService from '../services/profile.service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const profile = await profileService.getProfile();
  res.json(profile);
}));

router.put('/', asyncHandler(async (req, res) => {
  const profile = await profileService.updateProfile(req.body);
  res.json(profile);
}));

export default router;
