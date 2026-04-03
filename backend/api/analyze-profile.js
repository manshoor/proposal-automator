import { Router } from 'express';
import pool from '../db/pool.js';
import { callLLM } from '../lib/llm.js';
import { getLLMConfig } from '../lib/get-llm-config.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { ValidationError, ExternalServiceError } from '../lib/errors.js';

const router = Router();

function handleLLMError(err) {
  const status = err.status || err.statusCode;
  if (status === 401) throw new ValidationError('Invalid API key. Please check your settings.');
  if (status === 429) throw new ExternalServiceError('LLM', 'Rate limit reached. Please try again shortly.');
  throw new ExternalServiceError('LLM', 'Failed to generate response. Please try again.');
}

/**
 * POST /api/analyze-profile
 * Analyzes Upwork profile description and gives improvement feedback.
 * Can accept a profile description directly or fetch from the database.
 */
router.post('/', asyncHandler(async (req, res) => {
  const { profileDescription } = req.body;

  // Get LLM config — prefer request body, fall back to stored config
  let provider = req.body.provider;
  let apiKey = req.body.apiKey;
  if (!apiKey) {
    const config = await getLLMConfig();
    provider = config.provider;
    apiKey = config.apiKey;
  }
  if (!apiKey) {
    throw new ValidationError('No API key configured. Set it in dashboard settings or send in request.');
  }

  // Get profile data — either from request or from database
  let profile = {};
  try {
    const { rows } = await pool.query('SELECT * FROM profiles LIMIT 1');
    if (rows.length > 0) profile = rows[0];
  } catch (e) { /* use empty */ }

  const description = profileDescription || profile.summary || '';
  if (!description || description.trim().length < 10) {
    throw new ValidationError('Profile description is too short to analyze. Add more content to your profile summary.');
  }

  const systemPrompt = `You are an expert Upwork profile consultant. Analyze the freelancer's Upwork profile description and provide detailed, actionable feedback to improve their visibility, conversion rate, and client appeal.

Return ONLY a valid JSON object (no markdown fences) with this structure:

{
  "score": <0-100 overall profile score>,
  "headline": {
    "score": <0-100>,
    "current": "<the current title/headline if provided>",
    "feedback": "<what works or doesn't>",
    "suggestion": "<a better headline>"
  },
  "overview": {
    "score": <0-100>,
    "feedback": "<analysis of the profile overview/summary>",
    "strengths": ["<strength 1>", "<strength 2>"],
    "weaknesses": ["<weakness 1>", "<weakness 2>"]
  },
  "seo": {
    "score": <0-100>,
    "keywords_found": ["keyword1", "keyword2"],
    "keywords_missing": ["keyword1", "keyword2"],
    "feedback": "<SEO optimization advice for Upwork search>"
  },
  "first_impression": {
    "score": <0-100>,
    "feedback": "<analysis of the first 2-3 sentences — this is what clients see in search results>"
  },
  "call_to_action": {
    "score": <0-100>,
    "feedback": "<does the profile end with a clear CTA?>",
    "suggestion": "<suggested CTA if missing>"
  },
  "improvements": [
    "<specific actionable improvement 1>",
    "<specific actionable improvement 2>",
    "<specific actionable improvement 3>",
    "<specific actionable improvement 4>",
    "<specific actionable improvement 5>"
  ],
  "rewrite": "<a complete rewritten profile description that addresses all issues>"
}

Scoring guide:
- 90-100: Exceptional — stands out from competition
- 80-89: Strong — minor tweaks needed
- 70-79: Good — some weaknesses hurting conversion
- 60-69: Average — blends in with crowd
- Below 60: Weak — needs significant rework

Be HONEST. Most freelancer profiles are generic and score 50-65. A profile that says "I'm a passionate developer" should score below 50 for first_impression.`;

  const userPrompt = `Analyze this Upwork freelancer profile:

TITLE/HEADLINE: ${profile.title || 'Not set'}

PROFILE DESCRIPTION:
${description}

SKILLS: ${Array.isArray(profile.skills) ? profile.skills.join(', ') : 'Not set'}

HOURLY RATE: $${profile.default_hourly_rate || 'Not set'}/hr

Provide detailed analysis with scores, feedback, and a complete rewritten profile description.`;

  let rawResponse;
  try {
    rawResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 3000 });
  } catch (err) {
    handleLLMError(err);
  }

  let analysis;
  try {
    let cleaned = rawResponse.trim();
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    analysis = JSON.parse(cleaned);
  } catch (err) {
    throw new ExternalServiceError('LLM', 'LLM returned invalid response. Try again.');
  }

  res.json(analysis);
}));

export default router;
