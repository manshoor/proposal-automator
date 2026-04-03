import * as proposalRepo from '../repositories/proposal.repository.js';
import * as promptRepo from '../repositories/prompt.repository.js';
import { getProfileOrDefault } from './profile.service.js';
import { resolveLLMConfig, callLLM } from './llm.service.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/proposal.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

const ALLOWED_STATUSES = new Set(['sent', 'pending', 'hired', 'rejected', 'withdrawn']);

/**
 * Lists proposals with optional status filtering and pagination.
 *
 * @param {object} query  - req.query: { status, limit, offset, sort, order }
 * @param {string|null} userId
 * @returns {Promise<object[]>}
 */
export async function listProposals(query, userId = null) {
  const { status, limit = '20', offset = '0', sort = 'created_at', order = 'desc' } = query;
  return proposalRepo.findAll({ status, limit, offset, sort, order }, userId);
}

/**
 * Returns a single proposal by ID. Throws NotFoundError if missing.
 *
 * @param {string|number} id
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function getProposal(id, userId = null) {
  const proposal = await proposalRepo.findById(id, userId);
  if (!proposal) throw new NotFoundError('Proposal');
  return proposal;
}

/**
 * Creates a new proposal record.
 *
 * @param {object} data
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function createProposal(data, userId = null) {
  const { job_url, job_title, proposal_text } = data;
  if (!job_url || !job_title || !proposal_text) {
    throw new ValidationError('job_url, job_title, and proposal_text are required');
  }

  const {
    job_description,
    job_budget_type,
    job_budget_min,
    job_budget_max,
    job_budget_amount,
    job_skills,
    client_location,
    client_total_spent,
    client_hire_rate,
    client_review_count,
    hourly_rate,
    status,
    hidden_instructions,
    vetting_result,
    proposal_count,
  } = data;

  const row = await proposalRepo.create({
    job_url,
    job_title,
    job_description: job_description || null,
    job_budget_type: job_budget_type || null,
    job_budget_min: job_budget_min || null,
    job_budget_max: job_budget_max || null,
    job_budget_amount: job_budget_amount || null,
    job_skills: job_skills || [],
    client_location: client_location || null,
    client_total_spent: client_total_spent || null,
    client_hire_rate: client_hire_rate || null,
    client_review_count: client_review_count || null,
    proposal_text,
    hourly_rate: hourly_rate || null,
    hidden_instructions: hidden_instructions || null,
    vetting_result: vetting_result ? JSON.stringify(vetting_result) : null,
    proposal_count: proposal_count || null,
    connect_cost: null,
  }, userId);

  return row;
}

/**
 * Updates status and/or earnings on a proposal. Throws NotFoundError if missing.
 *
 * @param {string|number} id
 * @param {object} data  - { status?, earnings? }
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function updateProposal(id, data, userId = null) {
  const { status, earnings } = data;

  if (status !== undefined && status !== null && !ALLOWED_STATUSES.has(status)) {
    throw new ValidationError(`status must be one of: ${[...ALLOWED_STATUSES].join(', ')}`);
  }

  if (earnings !== undefined && earnings !== null) {
    const amt = parseFloat(earnings);
    if (isNaN(amt) || amt < 0) {
      throw new ValidationError('earnings must be a positive number');
    }
    data = { ...data, earnings: amt };
  }

  if (status === undefined && earnings === undefined) {
    throw new ValidationError('Nothing to update. Send status or earnings.');
  }

  const updated = await proposalRepo.update(id, data, userId);
  if (!updated) throw new NotFoundError('Proposal');
  return updated;
}

/**
 * Generates a proposal using the LLM, then persists it (non-fatal).
 *
 * @param {object} input
 * @param {object} input.jobData
 * @param {object} [input.hiddenInstructions]
 * @param {string} [input.templateContent]
 * @param {string} [input.extraInstruction]
 * @param {string} [input.existingProposal]
 * @param {Array}  [input.selectedProjects]
 * @param {string} [input.platform]
 * @param {string} [input.provider]
 * @param {string} [input.apiKey]
 * @param {object|null} logger  - Pino-compatible logger (req.log) or null
 * @param {string|null} userId
 * @returns {Promise<{coverLetter, hourlyRate, milestones, budgetWarning, proposalId}>}
 */
export async function generateProposal(input, logger = null, userId = null) {
  const {
    jobData,
    hiddenInstructions,
    templateContent,
    extraInstruction,
    existingProposal,
    selectedProjects,
    platform,
  } = input;

  // 1. Resolve LLM config
  const { provider, apiKey } = await resolveLLMConfig(input, userId);

  // 2. Validate jobData
  if (!jobData || typeof jobData !== 'object') {
    throw new ValidationError('jobData is required');
  }
  if (!jobData.title || !jobData.description) {
    throw new ValidationError('jobData: title and description are required');
  }

  // 3. Fetch profile (non-fatal)
  const profile = await getProfileOrDefault(userId);

  // 4. Build system prompt + check for custom prompt in DB
  let systemPrompt = buildSystemPrompt(profile);
  const targetPlatform = platform || 'upwork';
  try {
    const customPrompt = await promptRepo.findActiveForPlatform(targetPlatform, userId);
    if (customPrompt) {
      systemPrompt += '\n\n--- CUSTOM INSTRUCTIONS ---\n' + customPrompt.prompt_text;
    }
  } catch {
    // Non-fatal — use default prompt
  }

  // 5. Build user prompt
  let userPrompt = buildUserPrompt(jobData, hiddenInstructions);

  // 6. Append template, extra instruction, and selected projects
  if (templateContent) {
    userPrompt += `\n\nUSE THIS TEMPLATE AS A STRUCTURAL GUIDE for the cover letter. Fill in the variables with appropriate content based on the job:\n${templateContent}`;
  }

  if (extraInstruction && existingProposal) {
    userPrompt += `\n\nIMPORTANT: Here is the existing proposal. Rewrite it following this instruction: "${extraInstruction}"\n\nEXISTING PROPOSAL:\n${existingProposal}`;
  } else if (extraInstruction) {
    userPrompt += `\n\nADDITIONAL INSTRUCTION: ${extraInstruction}`;
  }

  if (selectedProjects && Array.isArray(selectedProjects) && selectedProjects.length > 0) {
    let projectsText = '\n\nRELEVANT PORTFOLIO PROJECTS to reference in the proposal (mention the most relevant ones as proof of experience):';
    selectedProjects.forEach((p, i) => {
      projectsText += `\n${i + 1}. "${p.name}"`;
      if (p.technologies) projectsText += ` — Technologies: ${p.technologies}`;
      if (p.description) projectsText += `\n   ${p.description.substring(0, 200)}`;
      if (p.outcome) projectsText += `\n   Result: ${p.outcome}`;
    });
    userPrompt += projectsText;
  }

  // 7. Call LLM
  const rawResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 2048 });

  // 8. Parse structured output
  const parsed = parseLLMResponse(rawResponse, profile, logger);

  // 9. Persist proposal (non-fatal)
  let proposalId = null;
  try {
    const row = await proposalRepo.create({
      job_url: jobData.url || '',
      job_title: jobData.title,
      job_description: jobData.description,
      job_budget_type: jobData.budgetType || null,
      job_budget_min: jobData.budgetMin || null,
      job_budget_max: jobData.budgetMax || null,
      job_budget_amount: jobData.budgetAmount || null,
      job_skills: jobData.skills || [],
      client_location: jobData.clientLocation || null,
      client_total_spent: jobData.clientTotalSpent || null,
      client_hire_rate: jobData.clientHireRate || null,
      client_review_count: jobData.clientReviewCount || null,
      proposal_text: parsed.coverLetter,
      hourly_rate: parsed.hourlyRate,
      hidden_instructions: hiddenInstructions?.text || null,
      vetting_result: jobData.vettingResult ? JSON.stringify(jobData.vettingResult) : null,
      proposal_count: jobData.proposalCount || null,
      connect_cost: jobData.connectCost || null,
    }, userId);
    proposalId = row?.id || null;
  } catch (dbErr) {
    logger?.error({ err: dbErr }, 'Failed to save proposal');
    // Non-fatal — still return the generated content
  }

  // 10. Return result
  return {
    coverLetter: parsed.coverLetter,
    hourlyRate: parsed.hourlyRate,
    milestones: parsed.milestones,
    budgetWarning: parsed.budgetWarning,
    proposalId,
  };
}

/**
 * Generates two A/B variant proposals in parallel.
 *
 * @param {object} input
 * @param {object} input.jobData
 * @param {object} [input.hiddenInstructions]
 * @param {string} [input.templateContent]
 * @param {string} [input.provider]
 * @param {string} [input.apiKey]
 * @param {string|null} userId
 * @returns {Promise<{variantA, variantB}>}
 */
export async function generateABVariants(input, userId = null) {
  const { jobData, hiddenInstructions, templateContent } = input;

  // 1. Resolve LLM config
  const { provider, apiKey } = await resolveLLMConfig(input, userId);

  // 2. Validate
  if (!jobData || !jobData.title || !jobData.description) {
    throw new ValidationError('jobData with title and description is required');
  }

  // 3. Fetch profile (non-fatal)
  const profile = await getProfileOrDefault(userId);

  // 4. Build prompts
  const systemPrompt = buildSystemPrompt(profile);
  const baseUserPrompt = buildUserPrompt(jobData, hiddenInstructions);
  const templateSuffix = templateContent ? '\n\nUSE THIS TEMPLATE AS A STRUCTURAL GUIDE:\n' + templateContent : '';

  const promptA = baseUserPrompt + '\n\nSTYLE INSTRUCTION: Write in a direct, confident, no-nonsense tone. Lead with your strongest qualification. Be assertive.' + templateSuffix;
  const promptB = baseUserPrompt + '\n\nSTYLE INSTRUCTION: Write in a consultative, thoughtful tone. Open with an insightful question about their project. Show curiosity and depth.' + templateSuffix;

  // 5. Call LLM x2 in parallel
  const [rawA, rawB] = await Promise.all([
    callLLM({ provider, apiKey, systemPrompt, userPrompt: promptA, maxTokens: 2048 }),
    callLLM({ provider, apiKey, systemPrompt, userPrompt: promptB, maxTokens: 2048 }),
  ]);

  // 6. Parse both variants
  const variantA = parseLLMResponse(rawA, profile, null);
  const variantB = parseLLMResponse(rawB, profile, null);

  return {
    variantA: { ...variantA, style: 'Direct & Confident' },
    variantB: { ...variantB, style: 'Consultative & Thoughtful' },
  };
}

/**
 * Parses the structured LLM output for a proposal response.
 * Extracts COVER_LETTER, HOURLY_RATE, MILESTONES, and BUDGET_WARNING sections.
 *
 * @param {string} raw           - Raw LLM text response
 * @param {object} profile       - Profile object for default hourly rate fallback
 * @param {object|null} logger   - Optional logger for milestone debug output
 * @returns {{ coverLetter, hourlyRate, milestones, budgetWarning }}
 */
function parseLLMResponse(raw, profile, logger) {
  const coverLetterMatch = raw.match(/COVER_LETTER:\s*([\s\S]*?)(?=HOURLY_RATE:|$)/i);
  const hourlyRateMatch = raw.match(/HOURLY_RATE:\s*([0-9]+(?:\.[0-9]{1,2})?)/i);

  const coverLetter = coverLetterMatch ? coverLetterMatch[1].trim() : raw.trim();
  const hourlyRate = hourlyRateMatch
    ? parseFloat(hourlyRateMatch[1])
    : profile.default_hourly_rate || 50.0;

  // Parse milestones (for fixed-price jobs)
  const milestones = [];
  const milestonesSection = raw.match(/MILESTONES:\s*([\s\S]*?)(?=BUDGET_WARNING:|$)/i);
  if (milestonesSection) {
    const lines = milestonesSection[1].trim().split('\n').filter(l => l.trim());
    logger?.info({ lines }, '[Milestones] Raw lines');
    for (const line of lines) {
      // Try multiple formats:
      // "1. Description | $200"
      // "1. Description - $200"
      // "1. Description — $200"
      // "1. Description $200"
      let m = line.match(/^\d+[\.\)]\s*(.+?)\s*[\|–—-]\s*\$?([\d,.]+)/);
      if (!m) {
        m = line.match(/^\d+[\.\)]\s*(.+?)\s+\$?([\d,.]+)\s*$/);
      }
      if (m) {
        milestones.push({
          description: m[1].replace(/[\|–—-]\s*$/, '').trim(),
          amount: parseFloat(m[2].replace(/,/g, '')),
        });
      }
    }
    logger?.info({ milestones }, '[Milestones] Parsed');
  }

  // Parse budget warning
  const budgetWarningMatch = raw.match(/BUDGET_WARNING:\s*(.+)/i);
  const budgetWarning = budgetWarningMatch ? budgetWarningMatch[1].trim() : null;

  return { coverLetter, hourlyRate, milestones, budgetWarning };
}
