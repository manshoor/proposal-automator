import { getLLMQueue, closeQueue } from './llm.queue.js';
import { startWorker, closeWorker } from './llm.worker.js';

export function initQueues() {
  getLLMQueue();
  startWorker();
}

export async function closeQueues() {
  await closeWorker();
  await closeQueue();
}

export { getLLMQueue } from './llm.queue.js';
