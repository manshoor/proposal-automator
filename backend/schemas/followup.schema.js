import { z } from 'zod';

export const createFollowUpSchema = z.object({
  proposalId: z.number().int().positive(),
  scheduledAt: z.string().datetime().optional(),
  intervalDays: z.number().int().min(1).max(90).optional(),
  messageText: z.string().min(1).max(2000).optional(),
  autoGenerate: z.boolean().default(false),
}).refine(
  (v) => v.scheduledAt || v.intervalDays,
  { message: 'Either scheduledAt or intervalDays is required' },
).refine(
  (v) => v.messageText || v.autoGenerate,
  { message: 'Provide messageText or set autoGenerate=true' },
);

export const updateFollowUpSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  messageText: z.string().min(1).max(2000).optional(),
  status: z.enum(['scheduled', 'sent', 'cancelled', 'expired']).optional(),
});

export const listQuerySchema = z.object({
  status: z.enum(['scheduled', 'sent', 'cancelled', 'expired']).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
});

export const createSequenceSchema = z.object({
  proposalId: z.number().int().positive(),
  intervals: z.array(z.number().int().min(1).max(90)).min(1).max(5),
  autoGenerate: z.boolean().default(true),
}).refine(
  (v) => new Set(v.intervals).size === v.intervals.length,
  { message: 'Intervals must be unique' },
);
