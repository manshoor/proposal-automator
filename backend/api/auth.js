import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limiter.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../schemas/auth.schema.js';
import * as authService from '../services/auth.service.js';
import { setAuthCookies, clearAuthCookies } from '../lib/cookies.js';
import { ValidationError } from '../lib/errors.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  setAuthCookies(res, result);
  res.status(201).json(result);
}));

router.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  setAuthCookies(res, result);
  res.json(result);
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  // Accept refresh token from body (extension) or cookie (dashboard).
  const bodyToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
  const cookieToken = typeof req.cookies?.refreshToken === 'string' ? req.cookies.refreshToken : '';
  const token = bodyToken || cookieToken;
  if (!token) {
    throw new ValidationError('refreshToken is required');
  }
  const result = await authService.refresh(token);
  setAuthCookies(res, result);
  res.json(result);
}));

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await authService.logout(req.user.id);
  clearAuthCookies(res);
  res.json({ success: true });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
  });
}));

export default router;
