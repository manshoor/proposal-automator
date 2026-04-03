import { Queue } from 'bullmq';
import { logger } from '../lib/logger.js';

let queue = null;

export function getLLMQueue() {
  if (queue) return queue;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const url = new URL(redisUrl);

  queue = new Queue('llm', {
    connection: {
      host: url.hostname,
      port: parseInt(url.port, 10) || 6379,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  });

  queue.on('error', (err) => {
    logger.error({ err }, 'BullMQ queue error');
  });

  return queue;
}

export async function closeQueue() {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
