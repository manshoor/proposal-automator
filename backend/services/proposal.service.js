import * as proposalRepo from '../repositories/proposal.repository.js';
import * as promptRepo from '../repositories/prompt.repository.js';
import * as projectRepo from '../repositories/project.repository.js';
import * as insightRepo from '../repositories/insight.repository.js';
import { getProfileOrDefault } from './profile.service.js';
import { resolveLLMConfig, callLLM } from './llm.service.js';
import { buildSystemPrompt, buildUserPrompt, buildAnalysisPrompt, injectProfileData } from '../prompts/proposal.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';
import { cacheGet, cacheSet, cacheDel, cacheDelPrefix } from '../lib/redis.js';

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
  const cacheKey = `proposals:${userId || 'global'}:${status || 'all'}:${limit}:${offset}:${sort}:${order}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);
  const result = await proposalRepo.findAll({ status, limit, offset, sort, order }, userId);
  await cacheSet(cacheKey, JSON.stringify(result), 120);
  return result;
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

  await cacheDel('analytics:' + (userId || 'global'));
  await cacheDelPrefix('proposals:' + (userId || 'global'));
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
  const { status, earnings, response_type, responded_at, decline_reason, client_feedback } = data;

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

  const hasUpdate = status !== undefined || earnings !== undefined
    || response_type !== undefined || responded_at !== undefined
    || decline_reason !== undefined || client_feedback !== undefined;

  if (!hasUpdate) {
    throw new ValidationError('Nothing to update.');
  }

  const updated = await proposalRepo.update(id, data, userId);
  if (!updated) throw new NotFoundError('Proposal');
  await cacheDel('analytics:' + (userId || 'global'));
  await cacheDelPrefix('proposals:' + (userId || 'global'));
  return updated;
}

/**
 * Deletes a proposal by ID. Throws NotFoundError if missing.
 */
export async function deleteProposal(id, userId = null) {
  const ok = await proposalRepo.remove(id, userId);
  if (!ok) throw new NotFoundError('Proposal');
  await cacheDel('analytics:' + (userId || 'global'));
  await cacheDelPrefix('proposals:' + (userId || 'global'));
  return { success: true };
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

  // 3. Fetch profile + custom prompt in parallel (non-fatal)
  const targetPlatform = platform || 'upwork';
  const [profile] = await Promise.all([
    getProfileOrDefault(userId),
  ]);

  // 3b. Validate profile has enough data for a quality proposal
  const profileSkills = Array.isArray(profile.skills) ? profile.skills : [];
  if (!profile.title || !profile.summary || profileSkills.length === 0) {
    throw new ValidationError(
      'Please fill out your profile (title, summary, and skills) in the dashboard before generating proposals.'
    );
  }

  // 4. Pre-generation job analysis (silent, non-blocking)
  let jobAnalysis = null;
  try {
    const analysisPrompt = buildAnalysisPrompt(jobData, profile);
    const analysisRaw = await callLLM({
      provider, apiKey,
      systemPrompt: analysisPrompt.system,
      userPrompt: analysisPrompt.user,
      maxTokens: 1024,
    });
    const cleaned = analysisRaw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    jobAnalysis = JSON.parse(cleaned);
    logger?.info({ jobAnalysis }, 'Job analysis complete');
  } catch (err) {
    logger?.warn({ err }, 'Job analysis failed, proceeding without it');
  }

  // 5. Build system prompt (3-tier resolution: user override → admin master → hardcoded)
  const [userSystemPrompt, globalSystemPrompt, customPrompt] = await Promise.all([
    promptRepo.findActiveByType('system', targetPlatform, userId).catch(() => null),
    promptRepo.findGlobalByType('system', targetPlatform).catch(() => null),
    promptRepo.findActiveByType('custom', targetPlatform, userId).catch(() => null),
  ]);

  let systemPrompt;
  if (userSystemPrompt) {
    systemPrompt = injectProfileData(userSystemPrompt.prompt_text, profile);
  } else if (globalSystemPrompt) {
    systemPrompt = injectProfileData(globalSystemPrompt.prompt_text, profile);
  } else {
    systemPrompt = buildSystemPrompt(profile);
  }

  if (customPrompt) {
    systemPrompt += '\n\n--- CUSTOM INSTRUCTIONS ---\n' + customPrompt.prompt_text;
  }

  // Inject learned patterns from outcome tracking
  try {
    const insights = await insightRepo.findActive(userId);
    if (insights.length > 0) {
      systemPrompt += '\n\nLEARNED PATTERNS (from your proposal history — follow these):';
      insights.forEach((r, i) => {
        systemPrompt += `\n${i + 1}. ${r.insight_text}`;
      });
    }
  } catch { /* non-fatal */ }

  // 6. Build user prompt
  let userPrompt = buildUserPrompt(jobData, hiddenInstructions);

  // Inject job analysis if available
  if (jobAnalysis) {
    const urgency = Array.isArray(jobAnalysis.urgencySignals) && jobAnalysis.urgencySignals.length > 0
      ? jobAnalysis.urgencySignals.join(', ')
      : 'None detected';
    const critical = Array.isArray(jobAnalysis.criticalRequirements)
      ? jobAnalysis.criticalRequirements.join('; ')
      : '';
    const flags = Array.isArray(jobAnalysis.redFlags) && jobAnalysis.redFlags.length > 0
      ? jobAnalysis.redFlags.join('; ')
      : 'None';

    userPrompt += `

JOB ANALYSIS (use these insights to write a targeted proposal):
- Pain point: ${jobAnalysis.painPoint || 'Not identified'}
- Urgency signals: ${urgency}
- Critical requirements: ${critical}
- Approach angle: ${jobAnalysis.approachAngle || ''}
- Suggested opening: ${jobAnalysis.openingHook || ''}
- Red flags: ${flags}`;
  }

  // 7. Append template, extra instruction, and selected projects
  if (templateContent) {
    userPrompt += `\n\nUSE THIS TEMPLATE AS A STRUCTURAL GUIDE for the cover letter. Fill in the variables with appropriate content based on the job:\n${templateContent}`;
  }

  if (extraInstruction && existingProposal) {
    userPrompt += `\n\nIMPORTANT: Here is the existing proposal. Rewrite it following this instruction: "${extraInstruction}"\n\nEXISTING PROPOSAL:\n${existingProposal}`;
  } else if (extraInstruction) {
    userPrompt += `\n\nADDITIONAL INSTRUCTION: ${extraInstruction}`;
  }

  // Auto-match portfolio projects if none manually selected
  let projectsToInclude = selectedProjects;
  if (!projectsToInclude || !Array.isArray(projectsToInclude) || projectsToInclude.length === 0) {
    try {
      const allProjects = await projectRepo.findAll({}, userId);
      const jobSkills = (jobData.skills || []).map(s => s.toLowerCase());
      if (allProjects.length > 0 && jobSkills.length > 0) {
        const scored = allProjects
          .map(p => {
            const techs = (Array.isArray(p.technologies) ? p.technologies : []).map(t => t.toLowerCase());
            const overlap = jobSkills.filter(s => techs.some(t => t.includes(s) || s.includes(t))).length;
            return { ...p, score: overlap };
          })
          .filter(p => p.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        if (scored.length > 0) projectsToInclude = scored;
      }
    } catch (err) {
      logger?.warn({ err }, 'Auto portfolio matching failed, continuing without projects');
    }
  }

  if (projectsToInclude && Array.isArray(projectsToInclude) && projectsToInclude.length > 0) {
    let projectsText = '\n\nRELEVANT PORTFOLIO PROJECTS to reference in the proposal (mention the most relevant ones as proof of experience):';
    projectsToInclude.forEach((p, i) => {
      projectsText += `\n${i + 1}. "${p.name}"`;
      if (p.technologies) {
        const techs = Array.isArray(p.technologies) ? p.technologies.join(', ') : p.technologies;
        projectsText += ` — Technologies: ${techs}`;
      }
      if (p.description) projectsText += `\n   ${p.description.substring(0, 200)}`;
      if (p.outcome) projectsText += `\n   Result: ${p.outcome}`;
    });
    userPrompt += projectsText;
  }

  // 7. Call LLM
  const rawResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 4096 });

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
      proposal_length: parsed.coverLetter ? parsed.coverLetter.length : null,
      template_used: templateContent ? 'custom' : null,
      hidden_instructions: hiddenInstructions?.text || null,
      vetting_result: jobData.vettingResult ? JSON.stringify(jobData.vettingResult) : null,
      proposal_count: jobData.proposalCount || null,
      connect_cost: jobData.connectCost || null,
    }, userId);
    proposalId = row?.id || null;
    await cacheDel('analytics:' + (userId || 'global'));
  await cacheDelPrefix('proposals:' + (userId || 'global'));
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
