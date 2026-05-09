// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema } from '../schemas/profile.schema.js';
import * as profileService from '../services/profile.service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const profile = await profileService.getProfile(req.user.id);
  res.json(profile);
}));

router.put('/', validate(updateProfileSchema), asyncHandler(async (req, res) => {
  const profile = await profileService.updateProfile(req.body, req.user.id);
  res.json(profile);
}));

export default router;