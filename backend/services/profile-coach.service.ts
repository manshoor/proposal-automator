// @ts-nocheck — TODO: tighten types in a follow-up iter
import { getProfileOrDefault } from './profile.service.js';
import { resolveLLMConfig, callLLM } from './llm.service.js';
import { ValidationError, AppError } from '../lib/errors.js';
import pool from '../db/pool.js';

const SYSTEM_PROMPT = `You are an Upwork profile coach reviewing a freelancer's profile to maximize their hire rate. Score each dimension 0-100 and give concrete, copy-pasteable improvements. Be brutally honest. Return ONLY valid JSON.`;

function buildUserPrompt(profile) {
  return `Analyze this Upwork freelancer profile and return scores + improvements.

PROFILE:
- Title: ${profile.title || 'Not set'}
- Summary: ${profile.summary || 'Not set'}
- Skills: ${Array.isArray(profile.skills) ? profile.skills.join(', ') : 'Not set'}
- Experience: ${profile.experience || 'Not set'}
- Portfolio: ${profile.portfolio || 'Not set'}
- Hourly rate: $${profile.default_hourly_rate || 'Not set'}

Return ONLY this JSON:
{
  "overallScore": <0-100>,
  "headline": {
    "score": <0-100>,
    "issues": ["<issue 1>", "<issue 2>"],
    "rewriteSuggestion": "<a punchier headline copy-pasteable as-is>"
  },
  "summary": {
    "score": <0-100>,
    "issues": ["..."],
    "openingRewrite": "<rewritten first 200 chars of the summary — the part clients see in search results>",
    "structureSuggestion": "<bullet list of how to restructure the rest>"
  },
  "skills": {
    "score": <0-100>,
    "issues": ["..."],
    "missing": ["<skills the profile should add>"],
    "redundant": ["<skills that dilute>"]
  },
  "rate": {
    "score": <0-100>,
    "verdict": "low" | "right" | "high",
    "reason": "<one sentence>"
  },
  "actionPriority": ["<top 3 highest-leverage changes in order>"]
}`;
}

function buildRetryUserPrompt(profile) {
  return `${buildUserPrompt(profile)}

IMPORTANT: Your previous response was not valid JSON. Return ONLY the raw JSON object with no surrounding text, no markdown fences, no explanation — just the JSON.`;
}

function parseJSON(raw) {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

/**
 * Runs an LLM-based profile coaching analysis for the given user.
 * Validates that the profile has enough content before calling the LLM.
 * Retries once with a stricter prompt if the first JSON parse fails.
 *
 * @param {string} userId
 * @param {object} logger  - pino-compatible logger (req.log)
 * @returns {Promise<object>}
 */
export async function analyzeProfile(userId, logger) {
  // 1. Load profile
  const profile = await getProfileOrDefault(userId);

  // 2. Validate that the profile has enough content to analyze
  const hasTitle = profile.title && profile.title.trim().length > 0;
  const hasSummary = profile.summary && profile.summary.trim().length > 0;
  const hasSkills = Array.isArray(profile.skills) && profile.skills.length > 0;

  if (!hasTitle && !hasSummary && !hasSkills) {
    throw new ValidationError(
      'Your profile is empty. Add a title, summary, and skills in the Profile page before running an analysis.',
    );
  }

  // 3. Resolve LLM config (reads stored provider/apiKey for this user)
  const { provider, apiKey } = await resolveLLMConfig({}, userId);

  const userPrompt = buildUserPrompt(profile);

  // 4. First LLM attempt
  const rawFirst = await callLLM({
    provider,
    apiKey,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2048,
  });

  let result;
  try {
    result = parseJSON(rawFirst);
  } catch {
    logger?.warn('profile-coach: first parse failed, retrying with stricter prompt');
  }

  // 5. Retry with a stricter prompt
  if (!result) {
    const retryPrompt = buildRetryUserPrompt(profile);
    const rawRetry = await callLLM({
      provider,
      apiKey,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: retryPrompt,
      maxTokens: 2048,
    });

    try {
      result = parseJSON(rawRetry);
    } catch {
      logger?.error('profile-coach: retry parse also failed');
      throw new AppError('Profile analysis failed: LLM returned unparseable output.', 502, 'PROFILE_ANALYSIS_FAILED');
    }
  }

  // Phase 6: persist for longitudinal tracking
  try {
    await pool.query(
      `INSERT INTO profile_analyses
         (user_id, overall_score, headline_score, summary_score, skills_score, rate_score, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        result.overallScore ?? null,
        result.headline?.score ?? null,
        result.summary?.score ?? null,
        result.skills?.score ?? null,
        result.rate?.score ?? null,
        JSON.stringify(result),
      ]
    );
  } catch (err) {
    logger?.warn?.({ err: err?.message }, 'profile analysis persist failed (non-fatal)');
  }

  return result;
}

export async function listHistory(userId, limit = 10) {
  const { rows } = await pool.query(
    `SELECT id, overall_score, headline_score, summary_score, skills_score, rate_score, created_at
     FROM profile_analyses
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100)]
  );
  return rows.map((r) => ({
    id: r.id,
    overallScore: r.overall_score,
    headlineScore: r.headline_score,
    summaryScore: r.summary_score,
    skillsScore: r.skills_score,
    rateScore: r.rate_score,
    createdAt: r.created_at,
  }));
}