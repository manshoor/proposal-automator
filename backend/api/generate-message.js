import { Router } from 'express';
import pool from '../db/pool.js';
import { callLLM } from '../lib/llm.js';
import { validateRequired } from '../lib/validators.js';
import { buildMessageSystemPrompt, buildMessageUserPrompt, buildQuestionUserPrompt } from '../prompts/message.js';

const router = Router();

const DEFAULT_PROFILE = {
  id: null,
  full_name: '',
  title: '',
  summary: '',
  skills: [],
  experience: '',
  portfolio: '',
  default_hourly_rate: 50.0,
};

/**
 * POST /api/generate-message
 *
 * Body:
 *   conversationHistory  Array<{sender: 'me'|'client', text: string}>
 *   jobTitle             string  (optional)
 *   question             string  (optional) — if provided, generates an answer to a screening question
 *   tone                 'professional' | 'friendly' | 'brief'
 *   provider             'anthropic' | 'openai'
 *   apiKey               string
 *
 * Response:
 *   { reply: string }
 */
router.post('/', async (req, res) => {
  const { conversationHistory, jobTitle, question, tone, provider, apiKey } = req.body;

  // Validate required fields
  const validation = validateRequired(['provider', 'apiKey'], req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.errors.join(', ') });
  }

  // conversationHistory must be an array if provided
  if (conversationHistory !== undefined && !Array.isArray(conversationHistory)) {
    return res.status(400).json({ error: 'conversationHistory must be an array' });
  }

  // Fetch profile from DB (fall back to default if none exists)
  let profile = DEFAULT_PROFILE;
  try {
    const { rows } = await pool.query('SELECT * FROM profiles LIMIT 1');
    if (rows.length > 0) {
      profile = rows[0];
    }
  } catch (dbErr) {
    console.error('[generate-message] Failed to fetch profile:', dbErr.message);
    // Non-fatal — use default profile
  }

  const resolvedTone = tone && ['professional', 'friendly', 'brief'].includes(tone)
    ? tone
    : 'professional';

  // Build prompts — screening question vs. reply
  const systemPrompt = buildMessageSystemPrompt(profile);
  let userPrompt;

  if (question) {
    userPrompt = buildQuestionUserPrompt(question, jobTitle || '', resolvedTone);
  } else {
    userPrompt = buildMessageUserPrompt(conversationHistory || [], jobTitle || '', resolvedTone);
  }

  // Call LLM
  let rawResponse;
  try {
    rawResponse = await callLLM({
      provider,
      apiKey,
      systemPrompt,
      userPrompt,
      maxTokens: 512,
    });
  } catch (llmErr) {
    const status = llmErr.status || llmErr.statusCode;
    if (status === 401) {
      return res.status(401).json({ error: 'Invalid API key. Please check your settings.' });
    }
    if (status === 429) {
      return res.status(429).json({ error: 'API rate limit reached. Please try again shortly.' });
    }
    console.error('[generate-message] LLM error:', llmErr.message);
    return res.status(502).json({ error: 'Failed to generate message. Please try again.' });
  }

  // Extract the reply after the REPLY: or ANSWER: label; fall back to raw response
  const replyMatch = rawResponse.match(/(?:REPLY|ANSWER):\s*([\s\S]+)/i);
  const reply = replyMatch ? replyMatch[1].trim() : rawResponse.trim();

  return res.status(200).json({ reply });
});

export default router;
