import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { llmLimiter } from '../middleware/rate-limiter.js';
import { validate } from '../middleware/validate.js';
import { generateProposalSchema } from '../schemas/proposal.schema.js';
import * as proposalService from '../services/proposal.service.js';
import { enqueueIfAsync } from '../lib/enqueue.js';

const router = Router();

router.post('/', llmLimiter, validate(generateProposalSchema), asyncHandler(async (req, res) => {
  if (await enqueueIfAsync(req, res, 'generateProposal', req.body)) return;
  const result = await proposalService.generateProposal(req.body, req.log, req.user.id);
  res.json(result);
}));

router.post('/ab', llmLimiter, validate(generateProposalSchema), asyncHandler(async (req, res) => {
  if (await enqueueIfAsync(req, res, 'generateABVariants', req.body)) return;
  const result = await proposalService.generateABVariants(req.body, req.user.id);
  res.json(result);
}));

export default router;
