import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as proposalService from '../services/proposal.service.js';

const router = Router();

router.post('/', asyncHandler(async (req, res) => {
  const result = await proposalService.generateProposal(req.body, req.log, req.user.id);
  res.json(result);
}));

router.post('/ab', asyncHandler(async (req, res) => {
  const result = await proposalService.generateABVariants(req.body, req.user.id);
  res.json(result);
}));

export default router;
