import 'dotenv/config';
import { validateEnv } from './lib/env.js';

// Fail fast if required env vars are missing or invalid
validateEnv();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { join } from 'path';

import { logger, requestLogger } from './lib/logger.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { globalLimiter } from './middleware/rate-limiter.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { register } from './lib/metrics.js';
import { runMigrations } from './db/migrate.js';
import pool from './db/pool.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { initQueues, closeQueues } from './queues/index.js';
import v1Router from './routes/v1/index.js';

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Middleware pipeline (order matters)
app.use(requestId);
app.use(requestLogger);
app.use(helmet({
  contentSecurityPolicy: IS_PROD ? undefined : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:3003'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
app.use(express.json({ limit: '50kb' }));
app.use(globalLimiter);
app.use(metricsMiddleware);

// Health check (before routes, no auth needed)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Prometheus metrics endpoint
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Static uploads
app.use('/uploads', express.static(join(process.cwd(), 'uploads'), { maxAge: '1d' }));

// HTTP caching for read-heavy endpoints
app.use(['/api/v1/templates', '/api/templates'], (req, res, next) => {
  if (req.method === 'GET') res.set('Cache-Control', 'private, max-age=300');
  next();
});
app.use(['/api/v1/settings', '/api/settings'], (req, res, next) => {
  if (req.method === 'GET') res.set('Cache-Control', 'private, max-age=300');
  next();
});

// API routes. /api/v1 is canonical; /api is a legacy alias kept for older
// extension builds that hardcoded the unversioned path. Remove once those
// clients have upgraded, or introduce a deprecation header here.
app.use('/api/v1', v1Router);
app.use('/api', v1Router);

// Centralized error handler (must be after routes)
app.use(errorHandler);

// Start server
async function start() {
  try {
    await runMigrations();
  } catch (err) {
    logger.error({ err }, 'Migration error');
    if (IS_PROD) {
      logger.fatal('Aborting — migration failure in production.');
      process.exit(1);
    }
    logger.warn('Continuing despite migration error (development mode).');
  }

  await connectRedis();
  initQueues();

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'Server running');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down gracefully');

    server.close(() => {
      Promise.all([
        closeQueues().then(() => logger.info('Job queues closed')),
        pool.end().then(() => logger.info('Database pool closed')),
        disconnectRedis().then(() => logger.info('Redis disconnected')),
      ]).then(() => process.exit(0)).catch((err) => {
        logger.error({ err }, 'Error during graceful shutdown');
        process.exit(1);
      });
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
