import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { runMigrations } from './db/migrate.js';
import pool from './db/pool.js';
import generateProposalRouter from './api/generate-proposal.js';
import generateMessageRouter from './api/generate-message.js';
import profileRouter from './api/profile.js';
import proposalsRouter from './api/proposals.js';
import templatesRouter from './api/templates.js';
import analyticsRouter from './api/analytics.js';
import parseResumeRouter from './api/parse-resume.js';
import settingsRouter from './api/settings.js';
import projectsRouter from './api/projects.js';
import parseProjectsRouter from './api/parse-projects.js';
import uploadRouter from './api/upload.js';
import promptsRouter from './api/prompts.js';
import analyzeProposalRouter from './api/analyze-proposal.js';
import { join } from 'path';

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json({ limit: '50kb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/generate-proposal', generateProposalRouter);
app.use('/api/generate-message', generateMessageRouter);
app.use('/api/profile', profileRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/parse-resume', parseResumeRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/parse-projects', parseProjectsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/analyze-proposal', analyzeProposalRouter);
app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

// Start server
async function start() {
  // Run database migrations
  try {
    await runMigrations();
  } catch (err) {
    console.error('Migration error:', err.message);
    if (IS_PROD) {
      console.error('Aborting — migration failure in production.');
      process.exit(1);
    }
    console.warn('Continuing despite migration error (development mode).');
  }

  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({
      level: 'info',
      message: `Server running on port ${PORT}`,
      env: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    }));
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(JSON.stringify({
      level: 'info',
      message: `${signal} received — shutting down gracefully`,
      timestamp: new Date().toISOString(),
    }));

    server.close(() => {
      pool.end().then(() => {
        console.log('Database pool closed.');
        process.exit(0);
      }).catch(() => process.exit(0));
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
