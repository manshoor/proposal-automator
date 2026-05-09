import rateLimit, { type Options as RateLimitOptions } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Request } from 'express';
import { getClient } from '../lib/redis.js';

function createStore(prefix: string): RateLimitOptions['store'] | undefined {
  try {
    const client = getClient();
    // RedisStore options have shifted union types across versions; cast the
    // options object as a whole rather than fighting individual fields.
    return new RedisStore({
      sendCommand: (...args: string[]) =>
        (client as unknown as { call: (...a: string[]) => Promise<unknown> }).call(...args),
      prefix: `rl:${prefix}:`,
    } as unknown as ConstructorParameters<typeof RedisStore>[0]);
  } catch {
    return undefined; // falls back to in-memory store
  }
}

// 100 requests per minute per user/IP — shared across instances via Redis
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown',
  store: createStore('global'),
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' } },
});

// 10 requests per 15 minutes on auth endpoints (brute force protection)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || 'unknown',
  store: createStore('auth'),
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many authentication attempts. Please wait 15 minutes.' } },
});

// 20 requests per minute on LLM endpoints (expensive operations)
export const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown',
  store: createStore('llm'),
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many AI requests. Please try again shortly.' } },
});
