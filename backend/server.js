import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { runMigrations } from './db/migrate.js';
import generateProposalRouter from './api/generate-proposal.js';
import generateMessageRouter from './api/generate-message.js';
import profileRouter from './api/profile.js';
import proposalsRouter from './api/proposals.js';
import templatesRouter from './api/templates.js';
import analyticsRouter from './api/analytics.js';
import parseResumeRouter from './api/parse-resume.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
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

// Start server after running migrations
async function start() {
  try {
    await runMigrations();
  } catch (err) {
    console.error('Migration error — server will still start:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Upwork Proposal backend running on http://localhost:${PORT}`);
  });
}

start();
