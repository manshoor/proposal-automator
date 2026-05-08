import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { getBootstrap } from '../services/bootstrap.service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const result = await getBootstrap(req.user.id);
  res.json(result);
}));

export default router;
