import { z } from 'zod';

export const createPromptSchema = z.object({
  name: z.string().min(1, 'Prompt name is required').max(255),
  platform: z.string().max(50).optional().default('all'),
  prompt_text: z.string().min(1, 'Prompt text is required'),
  is_active: z.boolean().optional().default(true),
});

export const updatePromptSchema = z.object({
  name: z.string().max(255).optional(),
  platform: z.string().max(50).optional(),
  prompt_text: z.string().optional(),
  is_active: z.boolean().optional(),
}).passthrough();
