import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../lib/logger.js';

const router = Router();

const errorReportSchema = z.object({
  source: z.enum(['popup', 'service-worker', 'content-script', 'dashboard']),
  message: z.string().min(1).max(2000),
  stack: z.string().max(20000).optional(),
  url: z.string().max(2000).optional(),
  context: z.record(z.any()).optional(),
  userAgent: z.string().max(500).optional(),
});

/**
 * POST /api/v1/errors
 *
 * Best-effort sink for client-side errors so they show up in backend logs
 * instead of disappearing silently. The endpoint always returns 204 even on
 * a partial failure — the client should never block on error reporting.
 */
router.post('/', validate(errorReportSchema), asyncHandler(async (req, res) => {
  const body = req.body;
  logger.warn({
    source: body.source,
    message: body.message,
    stack: body.stack,
    url: body.url,
    context: body.context,
    userAgent: body.userAgent,
    userId: req.user?.id || null,
  }, '[client-error]');
  res.status(204).end();
}));

export default router;
