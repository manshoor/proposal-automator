// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import {
  createFollowUpSchema,
  updateFollowUpSchema,
  listQuerySchema,
  createSequenceSchema,
} from '../schemas/followup.schema.js';
import * as service from '../services/followup.service.js';

const router = Router();

// POST / — create a new follow-up (optionally AI-generated)
router.post(
  '/',
  validate(createFollowUpSchema),
  asyncHandler(async (req, res) => {
    const followUp = await service.createFollowUp(req.body, req.user.id, req.log);
    res.status(201).json(followUp);
  })
);

// GET / — list follow-ups for the authenticated user
router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const followUps = await service.listForUser(req.user.id, req.query);
    res.json(followUps);
  })
);

// POST /sequence — schedule a multi-touch sequence of follow-ups at increasing intervals
// MUST be defined before /:id routes so "sequence" is not captured as an id parameter.
router.post(
  '/sequence',
  validate(createSequenceSchema),
  asyncHandler(async (req, res) => {
    const rows = await service.scheduleSequence(req.body, req.user.id, req.log);
    res.status(201).json(rows);
  })
);

// GET /:id — fetch a single follow-up
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const followUp = await service.getById(req.params.id, req.user.id);
    res.json(followUp);
  })
);

// PATCH /:id — update scheduledAt, messageText, or status
router.patch(
  '/:id',
  validate(updateFollowUpSchema),
  asyncHandler(async (req, res) => {
    const followUp = await service.updateFollowUp(req.params.id, req.body, req.user.id);
    res.json(followUp);
  })
);

// DELETE /:id — cancel the follow-up (status → 'cancelled')
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await service.cancelFollowUp(req.params.id, req.user.id);
    res.status(204).end();
  })
);

// POST /:id/regenerate — re-generate the message text via LLM
router.post(
  '/:id/regenerate',
  asyncHandler(async (req, res) => {
    const followUp = await service.regenerateMessage(req.params.id, req.user.id, req.log);
    res.json(followUp);
  })
);

export default router;