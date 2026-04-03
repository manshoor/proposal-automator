import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import * as messageService from '../services/message.service.js';

const router = Router();

router.post('/', asyncHandler(async (req, res) => {
  const result = await messageService.generateMessage(req.body, req.user.id);
  res.json(result);
}));

export default router;
