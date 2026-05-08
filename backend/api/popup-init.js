import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { getBootstrap } from '../services/bootstrap.service.js';
import * as connectsService from '../services/connects.service.js';
import * as outcomeService from '../services/outcome.service.js';

const router = Router();

/**
 * GET /api/v1/popup-init
 *
 * Single batched fetch for everything the popup needs on open:
 *   - bootstrap (profile, templates, projects, settings, recent URLs)
 *   - connects summary (balance, weekly spend, runway)
 *   - outcome tracking flag
 *
 * Replaces 3 sequential popup-open calls with one round-trip; saves
 * ~400-1000ms of perceived latency on every popup open.
 */
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const [bootstrap, connects, trackingEnabled] = await Promise.all([
    getBootstrap(userId),
    connectsService.getSummary(userId).catch(() => null),
    outcomeService.getTrackingEnabled(userId).catch(() => false),
  ]);

  res.json({
    bootstrap,
    connects,
    outcomeTracking: { enabled: !!trackingEnabled },
  });
}));

export default router;
