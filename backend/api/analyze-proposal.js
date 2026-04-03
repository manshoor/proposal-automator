import { Router } from 'express';
import { callLLM } from '../lib/llm.js';
import { buildAnalyzerSystemPrompt, buildAnalyzerUserPrompt } from '../prompts/analyzer.js';
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
 * POST /api/analyze-proposal
 * Analyzes a proposal against a job description. Returns structured feedback.
 */
router.post('/', asyncHandler(async (req, res) => {
  const { coverLetter, jobTitle, jobDescription, jobSkills } = req.body;

  if (!coverLetter) throw new ValidationError('coverLetter is required');

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

  const systemPrompt = buildAnalyzerSystemPrompt();
  const userPrompt = buildAnalyzerUserPrompt(coverLetter, jobTitle, jobDescription, jobSkills);

  let rawResponse;
  try {
    rawResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 2048 });
  } catch (err) {
    handleLLMError(err);
  }

  // Parse JSON response
  let analysis;
  try {
    let cleaned = rawResponse.trim();
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    analysis = JSON.parse(cleaned);
  } catch (err) {
    throw new ExternalServiceError('LLM', 'LLM returned invalid response. Try again.');
  }

  // Ensure first230.text is accurate (don't trust LLM to extract it correctly)
  if (analysis.first230) {
    analysis.first230.text = coverLetter.substring(0, 230);
  }

  res.json(analysis);
}));

export default router;
