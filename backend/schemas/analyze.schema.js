import { z } from 'zod';

export const analyzeProposalSchema = z.object({
  coverLetter: z.string().min(1, 'coverLetter is required'),
  jobTitle: z.string().optional(),
  jobDescription: z.string().optional(),
  jobSkills: z.array(z.string()).optional(),
  provider: z.string().optional(),
  apiKey: z.string().optional(),
}).passthrough();

export const analyzeProfileSchema = z.object({
  profileDescription: z.string().optional(),
  provider: z.string().optional(),
  apiKey: z.string().optional(),
}).passthrough();
