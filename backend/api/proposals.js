import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as proposalService from '../services/proposal.service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const proposals = await proposalService.listProposals(req.query, req.user.id);
  res.json(proposals);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const proposal = await proposalService.getProposal(req.params.id, req.user.id);
  res.json(proposal);
}));

router.post('/', asyncHandler(async (req, res) => {
  const proposal = await proposalService.createProposal(req.body, req.user.id);
  res.status(201).json(proposal);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const proposal = await proposalService.updateProposal(req.params.id, req.body, req.user.id);
  res.json(proposal);
}));

export default router;
