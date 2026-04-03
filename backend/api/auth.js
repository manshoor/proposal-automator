import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limiter.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema, refreshSchema } from '../schemas/auth.schema.js';
import * as authService from '../services/auth.service.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json(result);
}));

router.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
}));

router.post('/refresh', validate(refreshSchema), asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body.refreshToken);
  res.json(result);
}));

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await authService.logout(req.user.id);
  res.json({ success: true });
}));

export default router;
