import { getProfileOrDefault } from './profile.service.js';
import { resolveLLMConfig, callLLM } from './llm.service.js';
import { buildAnalyzerSystemPrompt, buildAnalyzerUserPrompt } from '../prompts/analyzer.js';
import { ValidationError, ExternalServiceError } from '../lib/errors.js';

/**
 * Analyzes a cover letter / proposal against a job description.
 * Returns structured feedback including a score, first-230-char analysis, and improvements.
 *
 * @param {object} input
 * @param {string} input.coverLetter
 * @param {string} [input.jobTitle]
 * @param {string} [input.jobDescription]
 * @param {string|string[]} [input.jobSkills]
 * @param {string} [input.provider]
 * @param {string} [input.apiKey]
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function analyzeProposal(input, userId = null) {
  const { coverLetter, jobTitle, jobDescription, jobSkills } = input;

  if (!coverLetter) throw new ValidationError('coverLetter is required');

  // 1. Resolve LLM config
  const { provider, apiKey } = await resolveLLMConfig(input, userId);

  // 2. Build analyzer prompts
  const systemPrompt = buildAnalyzerSystemPrompt();
  const userPrompt = buildAnalyzerUserPrompt(coverLetter, jobTitle, jobDescription, jobSkills);

  // 3. Call LLM
  const rawResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 2048 });

  // 4. Parse JSON response
  let analysis;
  try {
    let cleaned = rawResponse.trim();
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    analysis = JSON.parse(cleaned);
  } catch {
    throw new ExternalServiceError('LLM', 'LLM returned invalid response. Try again.');
  }

  // 5. Ensure first230.text is accurate (don't trust LLM to extract it correctly)
  if (analysis.first230) {
    analysis.first230.text = coverLetter.substring(0, 230);
  }

  return analysis;
}

/**
 * Analyzes a freelancer's Upwork profile description and returns improvement feedback.
 * Fetches the profile from the DB if no description is provided in the input.
 *
 * @param {object} input
 * @param {string} [input.profileDescription]
 * @param {string} [input.provider]
 * @param {string} [input.apiKey]
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function analyzeProfile(input, userId = null) {
  const { profileDescription } = input;

  // 1. Resolve LLM config
  const { provider, apiKey } = await resolveLLMConfig(input, userId);

  // 2. Fetch profile for context (non-fatal — use empty object on failure)
  const profile = await getProfileOrDefault(userId);

  const description = profileDescription || profile.summary || '';
  if (!description || description.trim().length < 10) {
    throw new ValidationError('Profile description is too short to analyze. Add more content to your profile summary.');
  }

  // 3. Build the profile analyzer system + user prompts
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

  // 4. Call LLM
  const rawResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 3000 });

  // 5. Parse JSON response
  let analysis;
  try {
    let cleaned = rawResponse.trim();
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    analysis = JSON.parse(cleaned);
  } catch {
    throw new ExternalServiceError('LLM', 'LLM returned invalid response. Try again.');
  }

  return analysis;
}

/**
 * Generates 3 catchy Upwork profile hooks tailored to the freelancer's niche.
 *
 * @param {object} input
 * @param {string} input.profileTitle
 * @param {string} [input.niche]
 * @param {string} [input.provider]
 * @param {string} [input.apiKey]
 * @param {string|null} userId
 * @returns {Promise<object>}
 */
export async function generateHooks(input, userId = null) {
  const { profileTitle, niche } = input;

  // 1. Resolve LLM config
  const { provider, apiKey } = await resolveLLMConfig(input, userId);

  if (!profileTitle) throw new ValidationError('profileTitle is required');

  // 2. Fetch profile for context (non-fatal)
  const profile = await getProfileOrDefault(userId);

  const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : '';

  // 3. Build hooks prompt
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

  // 4. Call LLM
  const rawResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 1500 });

  // 5. Parse JSON response
  let result;
  try {
    let cleaned = rawResponse.trim();
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    result = JSON.parse(cleaned);
  } catch {
    throw new ExternalServiceError('LLM', 'LLM returned invalid response. Try again.');
  }

  return result;
}
