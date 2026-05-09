import type { Request, Response } from 'express';
import type { Job } from 'bullmq';
import { getLLMQueue } from '../queues/index.js';

// getLLMQueue returns Queue (always non-null after init), but lib/enqueue
// runs before the queue may have been initialized. Re-fetching it returns
// the singleton.

/**
 * If req.query.async === 'true', enqueue the job and return 202.
 * Otherwise return null (caller should run synchronously).
 */
export async function enqueueIfAsync(
  req: Request & { user?: { id: string } },
  res: Response,
  jobName: string,
  data: unknown,
): Promise<Job | null> {
  if (req.query.async !== 'true') return null;

  const queue = getLLMQueue();
  const job = await queue.add(jobName, {
    input: data,
    userId: req.user?.id,
  });

  res.status(202).json({
    jobId: job.id,
    status: 'queued',
    pollUrl: `/api/v1/jobs/${job.id}`,
  });

  return job;
}
