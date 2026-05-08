import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { trackEventsSchema, trackingFlagSchema } from '../schemas/outcome.schema.js';
import * as outcomeService from '../services/outcome.service.js';
import * as learningService from '../services/learning.service.js';

const router = Router();

// Per-user in-process debounce for recomputePatterns.
// A burst of DOM events from the outcome-detector can otherwise spawn parallel recomputes
// for the same user; this coalesces them into a single run 5 s after the last event.
// NOTE: single-process only. For multi-instance deployments replace with a Redis SETNX lock
// or a dedicated debounce queue so instances don't race each other.
const recomputeTimers = new Map(); // userId → timeoutId

function scheduleRecompute(userId, logger) {
  if (recomputeTimers.has(userId)) clearTimeout(recomputeTimers.get(userId));
  const t = setTimeout(() => {
    recomputeTimers.delete(userId);
    learningService.recomputePatterns(userId, { logger }).catch((err) => {
      logger?.warn?.({ err: err?.message }, 'Pattern recompute failed (non-fatal)');
    });
  }, 5000);
  recomputeTimers.set(userId, t);
}

// Get / set the outcome_tracking_enabled flag
router.get('/tracking', asyncHandler(async (req, res) => {
  const enabled = await outcomeService.getTrackingEnabled(req.user.id);
  res.json({ enabled });
}));

router.put('/tracking', validate(trackingFlagSchema), asyncHandler(async (req, res) => {
  const result = await outcomeService.setTrackingEnabled(req.user.id, req.body.enabled);
  res.json(result);
}));

// Ingest a batch of outcome events from extension or dashboard
router.post('/events', validate(trackEventsSchema), asyncHandler(async (req, res) => {
  const result = await outcomeService.ingestEvents(req.body.events, req.user.id, req.log);
  // Best-effort recompute: if any events were accepted, refresh aggregates so insights/calibration stays current.
  if (result.accepted > 0) {
    scheduleRecompute(req.user.id, req.log);
  }
  res.status(201).json(result);
}));

// List events for a single proposal
router.get('/events', asyncHandler(async (req, res) => {
  const proposalId = parseInt(req.query.proposalId, 10);
  if (!Number.isFinite(proposalId)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'proposalId is required' } });
  }
  const events = await outcomeService.listForProposal(proposalId, req.user.id);
  res.json(events);
}));

// Manually mark a single proposal status (dashboard convenience)
router.post('/manual', asyncHandler(async (req, res) => {
  const { proposalId, eventType } = req.body || {};
  if (!proposalId || !eventType) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'proposalId and eventType are required' } });
  }
  const result = await outcomeService.manualMark(Number(proposalId), eventType, req.user.id, req.log);
  // Recompute on manual marks too
  scheduleRecompute(req.user.id, req.log);
  res.status(201).json(result);
}));

export default router;
