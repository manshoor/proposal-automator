// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { llmLimiter } from '../middleware/rate-limiter.js';
import * as analyticsService from '../services/analytics.service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getAnalytics(req.user.id);
  res.json(analytics);
}));

router.post('/learn', llmLimiter, asyncHandler(async (req, res) => {
  const result = await analyticsService.learnFromOutcomes(req.body, req.user.id);
  res.json(result);
}));

router.get('/insights', asyncHandler(async (req, res) => {
  const insights = await analyticsService.getInsights(req.user.id);
  res.json(insights);
}));

router.put('/insights/:id', asyncHandler(async (req, res) => {
  const insight = await analyticsService.updateInsight(req.params.id, req.body, req.user.id);
  res.json(insight);
}));

export default router;