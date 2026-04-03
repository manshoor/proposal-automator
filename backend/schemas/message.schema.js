import { z } from 'zod';

export const generateMessageSchema = z.object({
  conversationHistory: z.array(z.object({
    sender: z.enum(['me', 'client']),
    text: z.string(),
  })).optional(),
  jobTitle: z.string().optional(),
  question: z.string().optional(),
  tone: z.enum(['professional', 'friendly', 'brief']).optional().default('professional'),
  provider: z.string().optional(),
  apiKey: z.string().optional(),
}).passthrough();
