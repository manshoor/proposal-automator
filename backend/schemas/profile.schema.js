import { z } from 'zod';

export const updateProfileSchema = z.object({
  full_name: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  summary: z.string().optional(),
  skills: z.array(z.string()).optional(),
  experience: z.string().optional(),
  portfolio: z.string().optional(),
  default_hourly_rate: z.number().min(0).max(1000).optional(),
}); // allow extra fields from extension
