// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { llmLimiter } from '../middleware/rate-limiter.js';
import { validate } from '../middleware/validate.js';
import { analyzeProposalSchema } from '../schemas/analyze.schema.js';
import * as analyzerService from '../services/analyzer.service.js';
import { enqueueIfAsync } from '../lib/enqueue.js';

const router = Router();

router.post('/', llmLimiter, validate(analyzeProposalSchema), asyncHandler(async (req, res) => {
  if (await enqueueIfAsync(req, res, 'analyzeProposal', req.body)) return;
  const result = await analyzerService.analyzeProposal(req.body, req.user.id);
  res.json(result);
}));

export default router;