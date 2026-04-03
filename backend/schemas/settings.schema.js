import { z } from 'zod';

export const updateSettingsSchema = z.object({
  locations: z.array(z.string()).optional(),
  min_spent: z.number().min(0).optional(),
  min_hire_rate: z.number().min(0).max(100).optional(),
  min_reviews: z.number().min(0).optional(),
  notification_enabled: z.boolean().optional(),
  notification_interval: z.number().min(1).max(60).optional(),
  budget_min: z.number().min(0).optional().nullable(),
  budget_max: z.number().min(0).optional().nullable(),
  skills_include: z.array(z.string()).optional(),
  keywords_include: z.array(z.string()).optional(),
  keywords_exclude: z.array(z.string()).optional(),
  llm_provider: z.enum(['anthropic', 'openai']).optional(),
  llm_api_key: z.string().optional(),
}).passthrough();
