/**
 * AI-generic phrase detector.
 * Hybrid: rule pass via banned-phrase library + LLM-as-judge for paraphrased generic content.
 * If flagged, generates a rewrite suggestion the popup can offer.
 */
import { findBannedPhrases } from '../lib/banned-phrases.js';
import * as bannedPhrasesRepo from '../repositories/banned-phrases.repository.js';
import { callLLM } from './llm.service.js';

const JUDGE_FLAG_THRESHOLD = 5;

/**
 * Detect AI-generic content in a proposal body.
 *
 * @param {object} args
 * @param {string} args.text
 * @param {string} args.provider
 * @param {string} args.apiKey
 * @param {string|null} args.userId
 * @param {object|null} args.logger
 * @param {boolean} [args.skipRewrite] - Skip the rewrite suggestion call (saves an LLM call)
 * @returns {Promise<{ flagged, score, reasoning, genericPhrases, ruleHits, rewriteSuggestion }>}
 */
export async function detect({ text, provider, apiKey, userId, logger, skipRewrite }) {
  // Rule pass: hits anywhere in the body (not just first 230 chars)
  const phrases = await bannedPhrasesRepo.findActiveForUser(userId).catch(() => []);
  const ruleHits = findBannedPhrases(text || '', phrases);

  // LLM-as-judge pass
  const judge = await judgeWithLLM({ text, provider, apiKey, logger });

  const flagged = judge.score >= JUDGE_FLAG_THRESHOLD || ruleHits.some(h => h.severity === 'block');

  let rewriteSuggestion = null;
  if (flagged && !skipRewrite) {
    rewriteSuggestion = await suggestRewrite({
      text, provider, apiKey,
      score: judge.score,
      reasoning: judge.reasoning,
      genericPhrases: judge.genericPhrases,
      ruleHits,
      logger,
    });
  }

  return {
    flagged,
    score: judge.score,
    reasoning: judge.reasoning,
    genericPhrases: judge.genericPhrases,
    ruleHits,
    rewriteSuggestion,
  };
}

async function judgeWithLLM({ text, provider, apiKey, logger }) {
  const system = `You are a writing critic. Score how AI-generated a piece of text sounds on a scale of 0-10. 0 = sounds completely human and specific. 10 = sounds completely AI-generated and generic. Cite specific phrases that sound generic. Return ONLY valid JSON.`;
  const user = `Score this Upwork proposal text on the AI-genericness scale (0-10):

TEXT:
${text}

Return ONLY this JSON structure:
{
  "score": <integer 0-10>,
  "reasoning": "<one sentence describing why>",
  "genericPhrases": ["<phrase 1>", "<phrase 2>"]
}`;

  try {
    const raw = await callLLM({
      provider, apiKey,
      systemPrompt: system,
      userPrompt: user,
      maxTokens: 512,
    });
    const cleaned = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned);
    return {
      score: clamp(Math.round(Number(parsed.score) || 0), 0, 10),
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : null,
      genericPhrases: Array.isArray(parsed.genericPhrases) ? parsed.genericPhrases : [],
    };
  } catch (err) {
    logger?.warn({ err: err?.message }, 'AI-generic judge failed; defaulting to score 0');
    return { score: 0, reasoning: null, genericPhrases: [] };
  }
}

async function suggestRewrite({ text, provider, apiKey, score, reasoning, genericPhrases, ruleHits, logger }) {
  if (!text) return null;

  const issues = [];
  if (score >= JUDGE_FLAG_THRESHOLD) {
    issues.push(`Sounds AI-generated (judge score ${score}/10): ${reasoning || 'too generic'}`);
  }
  if (Array.isArray(genericPhrases) && genericPhrases.length > 0) {
    issues.push(`Generic phrases flagged: ${genericPhrases.map(p => `"${p}"`).join(', ')}`);
  }
  if (ruleHits.length > 0) {
    const blockHits = ruleHits.filter(h => h.severity === 'block').map(h => `"${h.phrase}"`);
    if (blockHits.length > 0) issues.push(`Banned phrases: ${blockHits.join(', ')}`);
  }

  const issuesNote = issues.join(' | ') || 'Generic AI tone detected';

  const system = `You rewrite Upwork proposals to sound less AI-generic and more like a real freelancer. Keep the same factual claims and structure but replace generic phrases with specific, concrete language. Do not add new information.`;
  const user = `Rewrite this proposal so it sounds less AI-generic. Issues to fix: ${issuesNote}

ORIGINAL:
${text}

Return ONLY the rewritten proposal text. No commentary, no labels, no preamble.`;

  try {
    const rewritten = await callLLM({
      provider, apiKey,
      systemPrompt: system,
      userPrompt: user,
      maxTokens: 2048,
    });
    return rewritten.trim();
  } catch (err) {
    logger?.warn({ err: err?.message }, 'AI-generic rewrite call failed');
    return null;
  }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
