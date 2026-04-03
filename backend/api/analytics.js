import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as analyticsService from '../services/analytics.service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getAnalytics();
  res.json(analytics);
}));

export default router;
