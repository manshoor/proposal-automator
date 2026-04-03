import { getLLMConfig } from '../lib/get-llm-config.js';
import { callLLM as callLLMRaw } from '../lib/llm.js';
import { ValidationError, ExternalServiceError } from '../lib/errors.js';

/**
 * Resolves the LLM provider and API key.
 * Prefers values from requestBody (backward compat), falls back to stored config.
 * Throws ValidationError if no key can be resolved.
 *
 * @param {object} requestBody  - The request body, may contain .provider and .apiKey
 * @param {string|null} userId
 * @returns {Promise<{provider: string, apiKey: string}>}
 */
export async function resolveLLMConfig(requestBody, userId = null) {
  let provider = requestBody.provider;
  let apiKey = requestBody.apiKey;

  if (!apiKey) {
    const config = await getLLMConfig(userId);
    provider = config.provider;
    apiKey = config.apiKey;
  }

  if (!apiKey) {
    throw new ValidationError('No API key configured. Set it in dashboard settings or send in request.');
  }

  return { provider, apiKey };
}

/**
 * Calls the LLM and normalizes provider errors into domain errors.
 *
 * @param {object} params
 * @param {string} params.provider
 * @param {string} params.apiKey
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {number} [params.maxTokens]
 * @returns {Promise<string>}
 */
export async function callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens = 2048 }) {
  try {
    return await callLLMRaw({ provider, apiKey, systemPrompt, userPrompt, maxTokens });
  } catch (err) {
    const status = err.status || err.statusCode;
    if (status === 401) throw new ValidationError('Invalid API key. Please check your settings.');
    if (status === 429) throw new ExternalServiceError('LLM', 'Rate limit reached. Please try again shortly.');
    throw new ExternalServiceError('LLM', 'Failed to generate response. Please try again.');
  }
}
