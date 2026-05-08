import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as profileCoachService from '../services/profile-coach.service.js';

const router = Router();

router.post('/analyze', asyncHandler(async (req, res) => {
  const result = await profileCoachService.analyzeProfile(req.user.id, req.log);
  res.json(result);
}));

router.get('/history', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const history = await profileCoachService.listHistory(req.user.id, limit);
  res.json(history);
}));

export default router;
