import { AuthenticationError } from '../lib/errors.js';
import { verifyAccessToken } from '../services/auth.service.js';

function extractUser(payload) {
  return { id: payload.sub, email: payload.email, role: payload.role || 'user' };
}

/**
 * Required authentication middleware.
 * Extracts JWT from Authorization header, verifies it, sets req.user.
 */
export function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Authentication required. Send Bearer token in Authorization header.');
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = extractUser(payload);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
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
export function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== 'admin') {
    throw new AuthenticationError('Admin access required.');
  }
  next();
}
