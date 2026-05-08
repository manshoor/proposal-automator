import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import * as connectsService from '../services/connects.service.js';

const router = Router();

const updateBalanceSchema = z.object({
  balance: z.number().int().min(0).max(100000),
});

/**
 * GET /api/v1/connects
 * Returns the user's stored Connects balance, when it was last updated,
 * their 7-day spend, and estimated runway in weeks.
 */
router.get('/', asyncHandler(async (req, res) => {
  const summary = await connectsService.getSummary(req.user.id);
  res.json(summary);
}));

/**
 * PUT /api/v1/connects/balance
 * Persist a freshly scraped Connects balance, then return the full summary.
 * Body: { balance: integer 0-100000 }
 */
router.put('/balance', validate(updateBalanceSchema), asyncHandler(async (req, res) => {
  await connectsService.setBalance(req.user.id, req.body.balance);
  const summary = await connectsService.getSummary(req.user.id);
  res.json(summary);
}));

export default router;
