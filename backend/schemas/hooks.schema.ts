import { z } from 'zod';

export const generateHooksSchema = z.object({
  profileTitle: z.string().min(1, 'profileTitle is required'),
  niche: z.string().optional(),
  provider: z.string().optional(),
  apiKey: z.string().optional(),
});

export type GenerateHooksInput = z.infer<typeof generateHooksSchema>;
