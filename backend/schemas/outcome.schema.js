import { z } from 'zod';

const eventTypeEnum = z.enum([
  'viewed', 'message_thread_opened', 'archived', 'hired', 'replied', 'interview',
]);

export const outcomeEventSchema = z.object({
  proposalId: z.number().int().positive().optional(),
  jobUrl: z.string().min(5).max(500).optional(),
  jobTitle: z.string().min(2).max(255).optional(),
  eventType: eventTypeEnum,
  source: z.enum(['dom', 'scrape', 'manual']).default('manual'),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine(
  (e) => e.proposalId || e.jobUrl || e.jobTitle,
  { message: 'Each event must include proposalId, jobUrl, or jobTitle' },
);

export const trackEventsSchema = z.object({
  events: z.array(outcomeEventSchema).min(1).max(50),
});

export const trackingFlagSchema = z.object({
  enabled: z.boolean(),
});
