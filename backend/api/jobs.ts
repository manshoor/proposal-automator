// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { NotFoundError } from '../lib/errors.js';
import { getLLMQueue } from '../queues/index.js';

const router = Router();

/**
 * GET /api/v1/jobs/:id
 * Poll for job status and result.
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const queue = getLLMQueue();
  const job = await queue.getJob(req.params.id);

  if (!job) {
    throw new NotFoundError('Job');
  }

  const state = await job.getState();

  const response = {
    id: job.id,
    name: job.name,
    status: state,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    createdAt: new Date(job.timestamp).toISOString(),
  };

  if (state === 'completed') {
    response.result = job.returnvalue;
  }

  if (state === 'failed') {
    response.error = job.failedReason;
  }

  res.json(response);
}));

export default router;