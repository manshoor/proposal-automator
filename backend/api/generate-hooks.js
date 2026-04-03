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
 * POST /api/generate-hooks
 * Generate 3 catchy profile hooks based on title, skills, and niche.
 */
router.post('/', asyncHandler(async (req, res) => {
  const { profileTitle, niche } = req.body;

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
  if (!profileTitle) throw new ValidationError('profileTitle is required');

  // Fetch profile for context
  let profile = {};
  try {
    const { rows } = await pool.query('SELECT * FROM profiles LIMIT 1');
    if (rows.length > 0) profile = rows[0];
  } catch (e) { /* use empty */ }

  const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : '';

  const systemPrompt = `You are an expert Upwork profile copywriter who specializes in writing hooks that convert visitors into clients. A "hook" is the first 1-2 sentences of an Upwork profile overview — the most critical text because it appears in search results and determines whether a client clicks on your profile.

Return ONLY a valid JSON object (no markdown fences) with this structure:

{
  "hooks": [
    {
      "text": "<the hook text — 1-2 sentences, under 200 characters>",
      "style": "<hook style: 'metric-driven' | 'question-based' | 'bold-claim'>",
      "why_it_works": "<1 sentence explaining why this hook is effective>"
    },
    {
      "text": "<hook 2>",
      "style": "<style>",
      "why_it_works": "<explanation>"
    },
    {
      "text": "<hook 3>",
      "style": "<style>",
      "why_it_works": "<explanation>"
    }
  ],
  "tips": [
    "<tip 1 for writing great hooks>",
    "<tip 2>",
    "<tip 3>"
  ]
}

Rules for writing hooks:
1. ALWAYS include quantifiable benefits — specific numbers, percentages, metrics
   Examples: "increased sales by 47%", "reduced bounce rates by 62%", "delivered 200+ projects"
2. Each hook must be a DIFFERENT style:
   - Hook 1: Metric-driven (leads with a specific achievement/number)
   - Hook 2: Question-based (opens with a pain-point question the client relates to)
   - Hook 3: Bold claim (makes a confident, specific promise)
3. Keep each hook under 200 characters — it must fit in the Upwork search preview
4. Do NOT use generic phrases like "passionate developer" or "dedicated professional"
5. Do NOT start with "I am" or "I'm a" — start with VALUE or a QUESTION
6. Make the numbers realistic for the niche — don't claim 500% increases
7. Each hook should make the client think "I need to read more"
8. Tailor to the specific niche/title provided`;

  const userPrompt = `Generate 3 catchy Upwork profile hooks for this freelancer:

PROFILE TITLE: ${profileTitle}
NICHE: ${niche || profileTitle}
SKILLS: ${skills || 'Not specified'}
EXPERIENCE SUMMARY: ${(profile.experience || '').substring(0, 500) || 'Not provided'}
CURRENT HOURLY RATE: $${profile.default_hourly_rate || 50}/hr

Create 3 hooks that emphasize quantifiable benefits specific to this niche. Make them impossible to scroll past.`;

  let rawResponse;
  try {
    rawResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 1500 });
  } catch (err) {
    handleLLMError(err);
  }

  let result;
  try {
    let cleaned = rawResponse.trim();
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    result = JSON.parse(cleaned);
  } catch (err) {
    throw new ExternalServiceError('LLM', 'LLM returned invalid response. Try again.');
  }

  res.json(result);
}));

export default router;
