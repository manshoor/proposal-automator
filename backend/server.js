import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { join } from 'path';

import { logger, requestLogger } from './lib/logger.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { globalLimiter } from './middleware/rate-limiter.js';
import { runMigrations } from './db/migrate.js';
import pool from './db/pool.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import v1Router from './routes/v1/index.js';

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Middleware pipeline (order matters)
app.use(requestId);
app.use(requestLogger);
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json({ limit: '50kb' }));
app.use(globalLimiter);

// Health check (before routes, no auth needed)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// Static uploads
app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

// API routes — v1 and backward-compatible unversioned
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

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'Server running');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down gracefully');

    server.close(() => {
      Promise.all([
        pool.end().then(() => logger.info('Database pool closed')),
        disconnectRedis().then(() => logger.info('Redis disconnected')),
      ]).then(() => process.exit(0)).catch(() => process.exit(0));
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
