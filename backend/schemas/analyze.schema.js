import { z } from 'zod';

export const analyzeProposalSchema = z.object({
  coverLetter: z.string().min(1, 'coverLetter is required').max(50000),
  jobTitle: z.string().max(500).optional(),
  jobDescription: z.string().max(50000).optional(),
  jobSkills: z.array(z.string().max(100)).max(50).optional(),
  provider: z.string().max(50).optional(),
  apiKey: z.string().max(500).optional(),
});

export const analyzeProfileSchema = z.object({
  profileDescription: z.string().max(50000).optional(),
  provider: z.string().max(50).optional(),
  apiKey: z.string().max(500).optional(),
});
