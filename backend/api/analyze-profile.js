import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { llmLimiter } from '../middleware/rate-limiter.js';
import { validate } from '../middleware/validate.js';
import { analyzeProfileSchema } from '../schemas/analyze.schema.js';
import * as analyzerService from '../services/analyzer.service.js';
import { enqueueIfAsync } from '../lib/enqueue.js';

const router = Router();

router.post('/', llmLimiter, validate(analyzeProfileSchema), asyncHandler(async (req, res) => {
  if (await enqueueIfAsync(req, res, 'analyzeProfile', req.body)) return;
  const result = await analyzerService.analyzeProfile(req.body, req.user.id);
  res.json(result);
}));

export default router;
