import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { llmLimiter } from '../middleware/rate-limiter.js';
import { validate } from '../middleware/validate.js';
import { analyzeProposalSchema } from '../schemas/analyze.schema.js';
import * as analyzerService from '../services/analyzer.service.js';

const router = Router();

router.post('/', llmLimiter, validate(analyzeProposalSchema), asyncHandler(async (req, res) => {
  const result = await analyzerService.analyzeProposal(req.body, req.user.id);
  res.json(result);
}));

export default router;
