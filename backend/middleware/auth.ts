import type { Request, Response, NextFunction } from 'express';
import { AuthenticationError } from '../lib/errors.js';
import { verifyAccessToken } from '../services/auth.service.js';

export interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'admin' | string;
}

interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
}

function extractUser(payload: JwtPayload): AuthUser {
  return { id: payload.sub, email: payload.email, role: payload.role || 'user' };
}

/**
 * Required authentication middleware.
 * Extracts JWT from Authorization header, verifies it, sets req.user.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  let token: string | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    // cookie-parser populates req.cookies; declared as any on Request
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    if (cookies && cookies.accessToken) {
      token = cookies.accessToken;
    }
  }

  if (!token) {
    throw new AuthenticationError('Authentication required. Send Bearer token in Authorization header or accessToken cookie.');
  }

  try {
    const payload = verifyAccessToken(token) as JwtPayload;
    req.user = extractUser(payload);
  } catch (err) {
    const e = err as { name?: string };
    if (e.name === 'TokenExpiredError') {
      throw new AuthenticationError('Access token expired. Please refresh.');
    }
    throw new AuthenticationError('Invalid access token.');
  }

  next();
}

/**
 * Admin authorization middleware. Must run after authenticate.
 * Checks req.user.role === 'admin'.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    throw new AuthenticationError('Admin access required.');
  }
  next();
}
