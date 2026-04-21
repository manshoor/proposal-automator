import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(255),
  description: z.string().optional().default(''),
  url: z.string().url().optional().nullable().or(z.literal('')),
  technologies: z.array(z.string()).optional().default([]),
  category: z.string().max(100).optional().default(''),
  client_name: z.string().max(255).optional().default(''),
  budget_range: z.string().max(100).optional().default(''),
  duration: z.string().max(100).optional().default(''),
  outcome: z.string().optional().default(''),
  is_featured: z.boolean().optional().default(false),
});

export const updateProjectSchema = z.object({
  name: z.string().max(255).optional(),
  description: z.string().optional(),
  url: z.string().optional().nullable(),
  technologies: z.array(z.string()).optional(),
  category: z.string().optional(),
  client_name: z.string().optional(),
  budget_range: z.string().optional(),
  duration: z.string().optional(),
  outcome: z.string().optional(),
  is_featured: z.boolean().optional(),
  screenshots: z.array(z.string()).optional(),
});
