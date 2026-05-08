import { z } from 'zod';

const HOOK_STYLE_KEYS = ['problem-mirror', 'metric-led', 'question-led', 'story-led'];
export const hookStyleEnum = z.enum(HOOK_STYLE_KEYS);

export const generateProposalSchema = z.object({
  jobData: z.object({
    title: z.string().min(1, 'Job title is required').max(500),
    description: z.string().min(1, 'Job description is required').max(50000),
    url: z.string().url().optional().or(z.literal('')),
    budgetType: z.string().max(50).optional().nullable(),
    budgetMin: z.number().min(0).optional().nullable(),
    budgetMax: z.number().min(0).optional().nullable(),
    budgetAmount: z.number().min(0).optional().nullable(),
    skills: z.array(z.string().max(100)).max(50).optional(),
    clientLocation: z.string().max(200).optional().nullable(),
    clientTotalSpent: z.string().max(100).optional().nullable(),
    clientHireRate: z.string().max(100).optional().nullable(),
    clientReviewCount: z.number().min(0).optional().nullable(),
    proposalCount: z.string().max(100).optional().nullable(),
    connectCost: z.number().min(0).optional().nullable(),
  }),
  hiddenInstructions: z.object({
    found: z.boolean(),
    instructions: z.array(z.string().max(500)).max(20),
  }).optional().nullable(),
  templateContent: z.string().max(50000).optional().nullable(),
  extraInstruction: z.string().max(5000).optional().nullable(),
  existingProposal: z.string().max(50000).optional().nullable(),
  selectedProjects: z.array(z.object({
    name: z.string().max(255),
    technologies: z.string().max(1000).optional(),
    description: z.string().max(5000).optional(),
    outcome: z.string().max(2000).optional(),
  })).max(20).optional().nullable(),
  platform: z.enum(['upwork', 'fiverr']).optional(),
  provider: z.string().max(50).optional(),
  apiKey: z.string().max(500).optional(),
  // Phase 1 — explicit hook style override (single proposal generation)
  hookStyle: hookStyleEnum.optional(),
  // Phase 1 — pair of styles for A/B generation (if not provided, defaults to ['problem-mirror','metric-led'])
  hookStyles: z.array(hookStyleEnum).length(2).optional(),
});

export const listProposalsSchema = z.object({
  status: z.enum(['sent', 'pending', 'hired', 'rejected', 'withdrawn']).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
  sort: z.enum(['created_at', 'updated_at', 'job_title', 'status', 'hourly_rate']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const createProposalSchema = z.object({
  job_url: z.string().min(1, 'job_url is required'),
  job_title: z.string().min(1, 'job_title is required'),
  proposal_text: z.string().min(1, 'proposal_text is required'),
});

export const updateProposalSchema = z.object({
  status: z.enum(['sent', 'pending', 'hired', 'rejected', 'withdrawn']).optional(),
  earnings: z.number().min(0).optional(),
  response_type: z.enum(['interview', 'hired', 'rejected', 'no_response']).optional(),
  responded_at: z.string().optional(),
  decline_reason: z.string().max(255).optional(),
  client_feedback: z.string().optional(),
});
