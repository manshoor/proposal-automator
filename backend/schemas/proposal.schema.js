import { z } from 'zod';

export const generateProposalSchema = z.object({
  jobData: z.object({
    title: z.string().min(1, 'Job title is required'),
    description: z.string().min(1, 'Job description is required'),
    url: z.string().optional(),
    budgetType: z.string().optional().nullable(),
    budgetMin: z.number().optional().nullable(),
    budgetMax: z.number().optional().nullable(),
    budgetAmount: z.number().optional().nullable(),
    skills: z.array(z.string()).optional(),
    clientLocation: z.string().optional().nullable(),
    clientTotalSpent: z.string().optional().nullable(),
    clientHireRate: z.string().optional().nullable(),
    clientReviewCount: z.number().optional().nullable(),
    proposalCount: z.string().optional().nullable(),
    connectCost: z.number().optional().nullable(),
  }).passthrough(),
  hiddenInstructions: z.any().optional().nullable(),
  templateContent: z.string().optional().nullable(),
  extraInstruction: z.string().optional().nullable(),
  existingProposal: z.string().optional().nullable(),
  selectedProjects: z.array(z.object({
    name: z.string(),
    technologies: z.string().optional(),
    description: z.string().optional(),
    outcome: z.string().optional(),
  }).passthrough()).optional().nullable(),
  platform: z.string().optional(),
  provider: z.string().optional(),
  apiKey: z.string().optional(),
}).passthrough();

export const listProposalsSchema = z.object({
  status: z.enum(['sent', 'pending', 'hired', 'rejected', 'withdrawn']).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
  sort: z.enum(['created_at', 'updated_at', 'job_title', 'status', 'hourly_rate']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
}).passthrough();

export const createProposalSchema = z.object({
  job_url: z.string().min(1, 'job_url is required'),
  job_title: z.string().min(1, 'job_title is required'),
  proposal_text: z.string().min(1, 'proposal_text is required'),
}).passthrough();

export const updateProposalSchema = z.object({
  status: z.enum(['sent', 'pending', 'hired', 'rejected', 'withdrawn']).optional(),
  earnings: z.number().min(0).optional(),
}).passthrough();
