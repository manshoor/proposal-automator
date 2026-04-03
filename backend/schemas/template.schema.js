import { z } from 'zod';

export const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(255),
  content: z.string().min(1, 'Template content is required'),
  is_default: z.boolean().optional(),
});

export const updateTemplateSchema = z.object({
  name: z.string().max(255).optional(),
  content: z.string().optional(),
  is_default: z.boolean().optional(),
});
