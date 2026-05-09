// @ts-nocheck — BullMQ Worker generic type drift; defer typing to a follow-up
import { Worker } from 'bullmq';
import { logger } from '../lib/logger.js';
import * as proposalService from '../services/proposal.service.js';
import * as messageService from '../services/message.service.js';
import * as analyzerService from '../services/analyzer.service.js';

let worker: Worker | null = null;

const handlers = {
  generateProposal: async (data) => {
    const { input, userId } = data;
    return proposalService.generateProposal(input, logger, userId);
  },
  generateABVariants: async (data) => {
    const { input, userId } = data;
    return proposalService.generateABVariants(input, userId);
  },
  generateMessage: async (data) => {
    const { input, userId } = data;
    return messageService.generateMessage(input, userId);
  },
  analyzeProposal: async (data) => {
    const { input, userId } = data;
    return analyzerService.analyzeProposal(input, userId);
  },
  analyzeProfile: async (data) => {
    const { input, userId } = data;
    return analyzerService.analyzeProfile(input, userId);
  },
  generateHooks: async (data) => {
    const { input, userId } = data;
    return analyzerService.generateHooks(input, userId);
  },
};

async function processJob(job) {
  const handler = handlers[job.name];
  if (!handler) {
    throw new Error(`Unknown job type: ${job.name}`);
  }
  logger.info({ jobId: job.id, jobName: job.name }, 'Processing LLM job');
  return handler(job.data);
}

export function startWorker() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const url = new URL(redisUrl);

  worker = new Worker('llm', processJob, {
    connection: {
      host: url.hostname,
      port: parseInt(url.port, 10) || 6379,
    },
    concurrency: 3,
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'LLM job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, 'LLM job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'BullMQ worker error');
  });

  logger.info('BullMQ LLM worker started (concurrency: 3)');
  return worker;
}

export async function closeWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
