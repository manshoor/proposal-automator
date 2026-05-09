// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/async-handler.js';
import { llmLimiter } from '../middleware/rate-limiter.js';
import * as parseService from '../services/parse.service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/', upload.single('resume'), llmLimiter, asyncHandler(async (req, res) => {
  const result = await parseService.parseResume(req.file, req.body, req.log, req.user.id);
  res.json(result);
}));

export default router;