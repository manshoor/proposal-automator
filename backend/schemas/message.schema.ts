import { z } from 'zod';

export const generateMessageSchema = z.object({
  conversationHistory: z.array(z.object({
    sender: z.enum(['me', 'client']),
    text: z.string().max(10000),
  })).max(100).optional(),
  jobTitle: z.string().max(500).optional(),
  question: z.string().max(5000).optional(),
  tone: z.enum(['professional', 'friendly', 'brief', 'rate-negotiation']).optional().default('professional'),
  provider: z.string().max(50).optional(),
  apiKey: z.string().max(500).optional(),
});

export type GenerateMessageInput = z.infer<typeof generateMessageSchema>;
