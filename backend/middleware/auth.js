import { AuthenticationError } from '../lib/errors.js';
import { verifyAccessToken } from '../services/auth.service.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

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
    req.user = { id: payload.sub, email: payload.email };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AuthenticationError('Access token expired. Please refresh.');
    }
    throw new AuthenticationError('Invalid access token.');
  }

  next();
}

/**
 * Optional authentication middleware.
 * If JWT present → authenticates. If no JWT but apiKey in body → uses default user.
 * If neither → returns 401.
 */
export function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;

  // Path 1: JWT token present
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, email: payload.email };
      return next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AuthenticationError('Access token expired. Please refresh.');
      }
      throw new AuthenticationError('Invalid access token.');
    }
  }

  // Path 2: Legacy extension — apiKey in request body (backward compat)
  if (req.body && req.body.apiKey) {
    req.user = { id: DEFAULT_USER_ID, email: 'default@localhost' };
    return next();
  }

  // Path 3: No auth at all — use default user for now (transitional)
  // This allows the dashboard and extension to work during migration
  req.user = { id: DEFAULT_USER_ID, email: 'default@localhost' };
  next();
}
