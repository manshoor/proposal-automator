// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { llmLimiter } from '../middleware/rate-limiter.js';
import { validate } from '../middleware/validate.js';
import { generateMessageSchema } from '../schemas/message.schema.js';
import * as messageService from '../services/message.service.js';
import { enqueueIfAsync } from '../lib/enqueue.js';

const router = Router();

router.post('/', llmLimiter, validate(generateMessageSchema), asyncHandler(async (req, res) => {
  if (await enqueueIfAsync(req, res, 'generateMessage', req.body)) return;
  const result = await messageService.generateMessage(req.body, req.user.id);
  res.json(result);
}));

export default router;