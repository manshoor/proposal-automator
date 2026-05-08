import * as proposalRepo from '../repositories/proposal.repository.js';
import * as promptRepo from '../repositories/prompt.repository.js';
import * as projectRepo from '../repositories/project.repository.js';
import * as insightRepo from '../repositories/insight.repository.js';
import { getProfileOrDefault } from './profile.service.js';
import { resolveLLMConfig, callLLM } from './llm.service.js';
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildAnalysisPrompt,
  injectProfileData,
  buildRetryGuidance,
  HOOK_STYLES,
} from '../prompts/proposal.js';
import { ValidationError, NotFoundError, AppError } from '../lib/errors.js';
import { cacheGet, cacheSet, cacheDel, cacheDelPrefix } from '../lib/redis.js';
import { validateHook } from './hook-validator.service.js';
import * as alignmentService from './alignment.service.js';
import * as boostROIService from './boost-roi.service.js';
import * as aiGenericDetector from './ai-generic-detector.service.js';
import * as preflightService from './preflight.service.js';
import * as learningService from './learning.service.js';
import * as personaService from './persona.service.js';
import * as bidRecommendService from './bid-recommend.service.js';
import * as clientHistoryService from './client-history.service.js';

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
    loom_url,
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
    loom_url: loom_url || null,
  }, userId);

  await cacheDel('analytics:' + (userId || 'global'));
  await cacheDelPrefix('proposals:' + (userId || 'global'));
  await cacheDel('bootstrap:' + (userId || 'global'));
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
  const { status, earnings, response_type, responded_at, decline_reason, client_feedback, loom_url, variantChosen } = data;

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
    || decline_reason !== undefined || client_feedback !== undefined
    || loom_url !== undefined || variantChosen !== undefined;

  if (!hasUpdate) {
    throw new ValidationError('Nothing to update.');
  }

  // Translate camelCase API field to snake_case column name for the repository layer
  const repoData = { ...data };
  if (variantChosen !== undefined) {
    repoData.variant_chosen = variantChosen;
    delete repoData.variantChosen;
  }

  const updated = await proposalRepo.update(id, repoData, userId);
  if (!updated) throw new NotFoundError('Proposal');
  await cacheDel('analytics:' + (userId || 'global'));
  await cacheDelPrefix('proposals:' + (userId || 'global'));
  await cacheDel('bootstrap:' + (userId || 'global'));
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
  await cacheDel('bootstrap:' + (userId || 'global'));
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
 * @param {string} [input.hookStyle]  - One of HOOK_STYLES keys; biases the opening
 * @param {object|null} logger  - Pino-compatible logger (req.log) or null
 * @param {string|null} userId
 * @returns {Promise<{coverLetter, hourlyRate, milestones, budgetWarning, proposalId, hookValidation, hookStyle}>}
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
    hookStyle: requestedHookStyle,
    loomUrl,
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

  // 3. Fetch profile + job analysis in parallel (non-fatal profile; mandatory analysis).
  // extractJobAnalysisOrThrow only needs jobData for the analysis LLM call —
  // profile.skills is used as context but is not required. We pass an empty-skills
  // stub so both calls can start immediately, saving ~10s on every proposal generation.
  const targetPlatform = platform || 'upwork';
  const [profile, jobAnalysis] = await Promise.all([
    getProfileOrDefault(userId),
    extractJobAnalysisOrThrow({ provider, apiKey, jobData, profileSkills: [], logger }),
  ]);

  // 3b. Validate profile has enough data for a quality proposal
  const profileSkills = Array.isArray(profile.skills) ? profile.skills : [];
  if (!profile.title || !profile.summary || profileSkills.length === 0) {
    throw new ValidationError(
      'Please fill out your profile (title, summary, and skills) in the dashboard before generating proposals.'
    );
  }

  // 3c. Phase 3 calibration: when user didn't specify a hookStyle, query learned patterns
  // for their best-performing style. Cascades: persona-specific → niche-specific → global.
  // Falls back to null when no confident bucket exists.
  let calibration = null;
  if (!requestedHookStyle) {
    try {
      const persona = personaService.classify(jobData.client || {}, jobData);
      const niche = personaService.classifyNiche(jobData);
      const recommendation = await learningService.recommendHookStyle(userId, {
        persona: persona.id,
        niche,
      });
      if (recommendation && recommendation.confidence === 'confident') {
        calibration = recommendation;
        logger?.info?.({ recommendation }, 'Using calibrated hook style from learned patterns');
      }
    } catch (err) {
      logger?.warn?.({ err: err?.message }, 'Hook style calibration lookup failed (non-fatal)');
    }
  }
  const hookStyle = requestedHookStyle || calibration?.hookStyle || null;

  // 4. jobAnalysis already resolved in step 3 via parallel Promise.all.

  // 5. Build system prompt (3-tier resolution: user override → admin master → hardcoded)
  const [userSystemPrompt, globalSystemPrompt, customPrompt] = await Promise.all([
    promptRepo.findActiveByType('system', targetPlatform, userId).catch(() => null),
    promptRepo.findGlobalByType('system', targetPlatform).catch(() => null),
    promptRepo.findActiveByType('custom', targetPlatform, userId).catch(() => null),
  ]);

  let systemPrompt;
  if (userSystemPrompt) {
    systemPrompt = injectProfileData(userSystemPrompt.prompt_text, profile);
    if (hookStyle && HOOK_STYLES[hookStyle]) {
      systemPrompt += '\n\n--- HOOK STYLE OVERRIDE ---\n' + HOOK_STYLES[hookStyle];
    }
  } else if (globalSystemPrompt) {
    systemPrompt = injectProfileData(globalSystemPrompt.prompt_text, profile);
    if (hookStyle && HOOK_STYLES[hookStyle]) {
      systemPrompt += '\n\n--- HOOK STYLE OVERRIDE ---\n' + HOOK_STYLES[hookStyle];
    }
  } else {
    systemPrompt = buildSystemPrompt(profile, hookStyle);
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

  // Inject job analysis (mandatory now — always present)
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

  // 7. Call LLM with hook-validator retry loop
  const { rawResponse, validation } = await generateWithValidation({
    provider, apiKey, systemPrompt, userPrompt,
    jobAnalysis, jobData, userId, logger,
  });

  // 8. Parse structured output
  const parsed = parseLLMResponse(rawResponse, profile, logger);

  // 8b. Phase 2: profile-job alignment + Boost ROI (deterministic, no LLM)
  const alignment = alignmentService.score(profile, jobData);
  const boostDecision = boostROIService.calc(jobData, profile, alignment);

  // Phase 6 Feature B: bid amount recommendation (deterministic, no LLM)
  const recommendation = bidRecommendService.recommend(jobData, profile, alignment, boostDecision);

  // Phase 6 Feature C: repeat-client intelligence
  let clientHistory = { hash: null, pastProposals: [] };
  try {
    clientHistory = await clientHistoryService.lookupHistory(jobData, userId);
  } catch (err) {
    logger?.warn?.({ err: err?.message }, 'client history lookup failed (non-fatal)');
  }

  // 8c. Phase 2: AI-generic detection (LLM-as-judge + optional rewrite suggestion)
  let aiGeneric = null;
  try {
    aiGeneric = await aiGenericDetector.detect({
      text: parsed.coverLetter,
      provider, apiKey,
      userId, logger,
    });
  } catch (err) {
    logger?.warn({ err: err?.message }, 'AI-generic detection failed (non-fatal)');
  }

  // 8d. Phase 2: pre-flight checklist (deterministic, runs over all the above)
  const preflight = preflightService.runPreflight({
    proposalText: parsed.coverLetter,
    jobData,
    profile,
    hookValidation: validation,
    alignment,
    boostDecision,
    projectsIncluded: projectsToInclude,
  });

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
      hook_style: hookStyle || null,
      payment_verified: jobData.client?.paymentVerified ?? null,
      loom_url: loomUrl || null,
      client_identity_hash: clientHistory.hash,
    }, userId);
    proposalId = row?.id || null;
    await cacheDel('analytics:' + (userId || 'global'));
    await cacheDelPrefix('proposals:' + (userId || 'global'));
    await cacheDel('bootstrap:' + (userId || 'global'));
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
    screeningAnswers: parsed.screeningAnswers,
    proposalId,
    hookValidation: validation,
    hookStyle: hookStyle || null,
    hookStyleSource: calibration ? 'calibrated' : (requestedHookStyle ? 'explicit' : 'default'),
    calibration,
    alignment,
    boostDecision,
    aiGeneric,
    preflight,
    loomUrl: loomUrl || null,
    recommendation,
    clientHistory,
  };
}

/**
 * Generates two A/B variant proposals in parallel, each with a distinct hook style.
 *
 * @param {object} input
 * @param {object} input.jobData
 * @param {object} [input.hiddenInstructions]
 * @param {string} [input.templateContent]
 * @param {string} [input.provider]
 * @param {string} [input.apiKey]
 * @param {string[]} [input.hookStyles]  - Two HOOK_STYLES keys; defaults to ['problem-mirror','metric-led']
 * @param {string|null} userId
 * @returns {Promise<{variantA, variantB}>}
 */
export async function generateABVariants(input, userId = null) {
  const { jobData, hiddenInstructions, templateContent, hookStyles } = input;

  // 1. Resolve LLM config
  const { provider, apiKey } = await resolveLLMConfig(input, userId);

  // 2. Validate
  if (!jobData || !jobData.title || !jobData.description) {
    throw new ValidationError('jobData with title and description is required');
  }

  // 3. Pick hook styles (validated against HOOK_STYLES; default to problem-mirror + metric-led)
  const validStyles = Object.keys(HOOK_STYLES);
  const styles = Array.isArray(hookStyles)
    && hookStyles.length === 2
    && hookStyles.every((s) => validStyles.includes(s))
    ? hookStyles
    : DEFAULT_AB_STYLES;

  // 4. Fetch profile (non-fatal)
  const profile = await getProfileOrDefault(userId);

  // 5. Build prompts (one system prompt per style)
  const baseUserPrompt = buildUserPrompt(jobData, hiddenInstructions);
  const templateSuffix = templateContent ? '\n\nUSE THIS TEMPLATE AS A STRUCTURAL GUIDE:\n' + templateContent : '';
  const userPrompt = baseUserPrompt + templateSuffix;
  const [systemA, systemB] = styles.map((s) => buildSystemPrompt(profile, s));

  // 6. Call LLM x2 in parallel
  const [rawA, rawB] = await Promise.all([
    callLLM({ provider, apiKey, systemPrompt: systemA, userPrompt, maxTokens: 2048 }),
    callLLM({ provider, apiKey, systemPrompt: systemB, userPrompt, maxTokens: 2048 }),
  ]);

  // 7. Parse both variants
  const parsedA = parseLLMResponse(rawA, profile, null);
  const parsedB = parseLLMResponse(rawB, profile, null);

  // 8. Validate each variant's hook (no LLM cost — pattern checks only).
  // jobAnalysis is intentionally null on the A/B path; validator gracefully skips
  // the job-specifics check but still catches banned phrases and generic openers.
  const [validationA, validationB] = await Promise.all([
    validateHook(parsedA.coverLetter, null, jobData, userId),
    validateHook(parsedB.coverLetter, null, jobData, userId),
  ]);

  // 9. Persist each variant with its hook_style label so the learning loop (Phase 3)
  // can attribute outcomes per style. Persist failure is non-fatal.
  const [proposalIdA, proposalIdB] = await Promise.all([
    persistABVariant(parsedA, jobData, hiddenInstructions, templateContent, styles[0], userId),
    persistABVariant(parsedB, jobData, hiddenInstructions, templateContent, styles[1], userId),
  ]);

  return {
    variantA: {
      ...parsedA,
      style: styles[0],
      hookStyle: styles[0],
      hookValidation: validationA,
      proposalId: proposalIdA,
    },
    variantB: {
      ...parsedB,
      style: styles[1],
      hookStyle: styles[1],
      hookValidation: validationB,
      proposalId: proposalIdB,
    },
  };
}

async function persistABVariant(parsed, jobData, hiddenInstructions, templateContent, hookStyle, userId) {
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
      hook_style: hookStyle,
      payment_verified: jobData.client?.paymentVerified ?? null,
      loom_url: null,
    }, userId);
    return row?.id || null;
  } catch {
    return null;
  }
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

  // Phase 4: parse screening answers (mirrors MILESTONES parsing)
  const screeningAnswers = [];
  const sectionMatch = raw.match(/SCREENING_ANSWERS:\s*([\s\S]*?)(?=COVER_LETTER:|HOURLY_RATE:|MILESTONES:|BUDGET_WARNING:|$)/i);
  if (sectionMatch) {
    const lines = sectionMatch[1].trim().split('\n').filter(l => l.trim());
    for (const line of lines) {
      const m = line.match(/^\d+[\.\)]\s*(.+)/);
      if (m) screeningAnswers.push(m[1].trim());
    }
  }

  return { coverLetter, hourlyRate, milestones, budgetWarning, screeningAnswers };
}

// ============================================================================
// Helpers — Phase 1 Hook Surgeon
// ============================================================================

const DEFAULT_AB_STYLES = ['problem-mirror', 'metric-led'];
const MAX_GENERATION_ATTEMPTS = 3;

/**
 * Extracts job analysis (pain point, requirements, etc) from the LLM.
 * Mandatory — retries once on failure, then throws AppError(JOB_ANALYSIS_FAILED).
 *
 * Accepts either a full `profile` object (legacy) or a `profileSkills` array so the
 * call can be parallelized with getProfileOrDefault without waiting for the profile fetch.
 */
async function extractJobAnalysisOrThrow({ provider, apiKey, jobData, profile, profileSkills, logger }) {
  // Support both calling conventions: full profile object (legacy internal callers)
  // and a plain skills array (parallel path from generateProposal).
  const effectiveProfile = profile ?? { skills: profileSkills ?? [] };
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const analysisPrompt = buildAnalysisPrompt(jobData, effectiveProfile);
      const analysisRaw = await callLLM({
        provider, apiKey,
        systemPrompt: analysisPrompt.system,
        userPrompt: analysisPrompt.user,
        maxTokens: 1024,
      });
      const cleaned = analysisRaw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
      const parsed = JSON.parse(cleaned);
      logger?.info({ attempt }, 'Job analysis complete');
      return parsed;
    } catch (err) {
      lastErr = err;
      logger?.warn({ err: err?.message, attempt }, 'Job analysis attempt failed');
    }
  }
  throw new AppError(
    'Job analysis failed — could not extract client pain point. Try again or simplify the job description.',
    400,
    'JOB_ANALYSIS_FAILED',
    lastErr ? [{ reason: String(lastErr.message || lastErr) }] : null,
  );
}

/**
 * Generates a proposal with a hook-validation retry loop.
 * Calls the LLM up to MAX_GENERATION_ATTEMPTS times. On each attempt, validates the
 * first 230 chars; if blockers exist and attempts remain, retries with stricter prompt.
 * Returns the best-scoring attempt regardless.
 */
async function generateWithValidation({
  provider, apiKey, systemPrompt, userPrompt,
  jobAnalysis, jobData, userId, logger,
}) {
  let bestAttempt = null;
  let currentUserPrompt = userPrompt;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const rawResponse = await callLLM({
      provider, apiKey, systemPrompt,
      userPrompt: currentUserPrompt,
      maxTokens: 4096,
    });
    const parsed = parseLLMResponse(rawResponse, { default_hourly_rate: 50 }, null);
    const validation = await validateHook(parsed.coverLetter, jobAnalysis, jobData, userId);

    logger?.info({
      attempt,
      score: validation.score,
      blockerCount: validation.blockers.length,
      issueCount: validation.issues.length,
    }, 'Hook validation result');

    if (!bestAttempt || validation.score > bestAttempt.validation.score) {
      bestAttempt = { rawResponse, validation };
    }

    if (!validation.hasBlocker) {
      return { rawResponse, validation };
    }

    if (attempt < MAX_GENERATION_ATTEMPTS && validation.failureSummary) {
      currentUserPrompt = userPrompt + '\n\n' + buildRetryGuidance(validation.failureSummary);
    }
  }

  logger?.warn({ score: bestAttempt.validation.score }, 'Hook validation never passed; returning best attempt');
  return bestAttempt;
}
