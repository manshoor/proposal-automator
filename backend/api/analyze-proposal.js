import { Router } from 'express';
import { callLLM } from '../lib/llm.js';
import { buildAnalyzerSystemPrompt, buildAnalyzerUserPrompt } from '../prompts/analyzer.js';

const router = Router();

/**
 * POST /api/analyze-proposal
 * Analyzes a proposal against a job description. Returns structured feedback.
 */
router.post('/', async (req, res) => {
  const { coverLetter, jobTitle, jobDescription, jobSkills, provider, apiKey } = req.body;

  if (!coverLetter) return res.status(400).json({ error: 'coverLetter is required' });
  if (!provider || !apiKey) return res.status(400).json({ error: 'provider and apiKey are required' });

  const systemPrompt = buildAnalyzerSystemPrompt();
  const userPrompt = buildAnalyzerUserPrompt(coverLetter, jobTitle, jobDescription, jobSkills);

  let rawResponse;
  try {
    rawResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 2048 });
  } catch (err) {
    const status = err.status || err.statusCode;
    if (status === 401) return res.status(401).json({ error: 'Invalid API key.' });
    if (status === 429) return res.status(429).json({ error: 'Rate limit reached.' });
    return res.status(502).json({ error: 'LLM failed to analyze proposal.' });
  }

  // Parse JSON response
  let analysis;
  try {
    let cleaned = rawResponse.trim();
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    analysis = JSON.parse(cleaned);
  } catch (err) {
    console.error('Analyzer JSON parse error:', err.message, 'Raw:', rawResponse.substring(0, 300));
    return res.status(502).json({ error: 'LLM returned invalid analysis. Try again.' });
  }

  // Ensure first230.text is accurate (don't trust LLM to extract it correctly)
  if (analysis.first230) {
    analysis.first230.text = coverLetter.substring(0, 230);
  }

  res.json(analysis);
});

export default router;
