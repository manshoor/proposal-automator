import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as profileCoachService from '../services/profile-coach.service.js';

const router = Router();

router.post('/analyze', asyncHandler(async (req, res) => {
  const result = await profileCoachService.analyzeProfile(req.user.id, req.log);
  res.json(result);
}));

export default router;
