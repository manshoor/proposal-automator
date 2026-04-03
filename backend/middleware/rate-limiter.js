import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getClient } from '../lib/redis.js';

function createStore(prefix) {
  try {
    const client = getClient();
    return new RedisStore({
      sendCommand: (...args) => client.call(...args),
      prefix: `rl:${prefix}:`,
    });
  } catch {
    return undefined; // falls back to in-memory store
  }
}

// 100 requests per minute per user/IP
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  store: createStore('global'),
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' } },
});

// 10 requests per 15 minutes on auth endpoints (brute force protection)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  store: createStore('auth'),
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many authentication attempts. Please wait 15 minutes.' } },
});

// 20 requests per minute on LLM endpoints (expensive operations)
export const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  store: createStore('llm'),
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many AI requests. Please try again shortly.' } },
});
