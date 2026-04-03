import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as analyzerService from '../services/analyzer.service.js';

const router = Router();

router.post('/', asyncHandler(async (req, res) => {
  const result = await analyzerService.analyzeProfile(req.body);
  res.json(result);
}));

export default router;
