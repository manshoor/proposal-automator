import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as learningService from '../services/learning.service.js';

const router = Router();

/**
 * GET /api/v1/insights — returns aggregated patterns from user_patterns.
 *
 * Query: ?recompute=1 to force aggregation from raw events instead of cache.
 */
router.get('/', asyncHandler(async (req, res) => {
  const force = req.query.recompute === '1' || req.query.recompute === 'true';
  if (force) {
    const fresh = await learningService.recomputePatterns(req.user.id, { logger: req.log });
    return res.json(fresh);
  }
  const cached = await learningService.readPatterns(req.user.id);
  res.json(cached);
}));

/**
 * POST /api/v1/insights/recompute — explicit recompute trigger.
 */
router.post('/recompute', asyncHandler(async (req, res) => {
  const result = await learningService.recomputePatterns(req.user.id, { logger: req.log });
  res.json(result);
}));

export default router;
