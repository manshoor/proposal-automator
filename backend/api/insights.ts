// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as learningService from '../services/learning.service.js';

const router = Router();

/**
 * GET /api/v1/insights — returns aggregated patterns from user_patterns plus
 * a conversion funnel computed directly from proposals + proposal_outcomes.
 *
 * Query: ?recompute=1 to force aggregation from raw events instead of cache.
 */
router.get('/', asyncHandler(async (req, res) => {
  const force = req.query.recompute === '1' || req.query.recompute === 'true';

  const [patterns, funnel] = await Promise.all([
    force
      ? learningService.recomputePatterns(req.user.id, { logger: req.log })
      : learningService.readPatterns(req.user.id),
    learningService.computeFunnel(req.user.id),
  ]);

  res.json({ ...patterns, funnel });
}));

/**
 * POST /api/v1/insights/recompute — explicit recompute trigger.
 */
router.post('/recompute', asyncHandler(async (req, res) => {
  const [patterns, funnel] = await Promise.all([
    learningService.recomputePatterns(req.user.id, { logger: req.log }),
    learningService.computeFunnel(req.user.id),
  ]);
  res.json({ ...patterns, funnel });
}));

export default router;