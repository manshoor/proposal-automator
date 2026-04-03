import { getLLMQueue } from '../queues/index.js';

/**
 * If req.query.async === 'true', enqueue the job and return 202.
 * Otherwise return null (caller should run synchronously).
 */
export async function enqueueIfAsync(req, res, jobName, data) {
  if (req.query.async !== 'true') return null;

  const queue = getLLMQueue();
  const job = await queue.add(jobName, {
    input: data,
    userId: req.user.id,
  });

  res.status(202).json({
    jobId: job.id,
    status: 'queued',
    pollUrl: `/api/v1/jobs/${job.id}`,
  });

  return job;
}
