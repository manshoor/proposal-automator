import { z } from 'zod';

export const createBannedPhraseSchema = z.object({
  phrase: z.string().min(2, 'Phrase must be at least 2 characters').max(200, 'Phrase too long'),
  severity: z.enum(['block', 'warn']).default('warn'),
  scope: z.enum(['admin', 'user']).default('user'),
});

export type CreateBannedPhraseInput = z.infer<typeof createBannedPhraseSchema>;
