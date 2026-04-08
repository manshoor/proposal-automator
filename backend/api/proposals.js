import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { listProposalsSchema, createProposalSchema, updateProposalSchema } from '../schemas/proposal.schema.js';
import * as proposalService from '../services/proposal.service.js';

const router = Router();

router.get('/', validate(listProposalsSchema, 'query'), asyncHandler(async (req, res) => {
  const proposals = await proposalService.listProposals(req.query, req.user.id);
  res.json(proposals);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const proposal = await proposalService.getProposal(req.params.id, req.user.id);
  res.json(proposal);
}));

router.post('/', validate(createProposalSchema), asyncHandler(async (req, res) => {
  const proposal = await proposalService.createProposal(req.body, req.user.id);
  res.status(201).json(proposal);
}));

router.put('/:id', validate(updateProposalSchema), asyncHandler(async (req, res) => {
  const proposal = await proposalService.updateProposal(req.params.id, req.body, req.user.id);
  res.json(proposal);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await proposalService.deleteProposal(req.params.id, req.user.id);
  res.json(result);
}));

export default router;
