import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/**
 * @param {{ provider: string, apiKey: string, systemPrompt: string, userPrompt: string, maxTokens?: number }} options
 * @returns {Promise<string>}
 */
const LLM_TIMEOUT_MS = 90_000; // 90 seconds

export async function callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens = 2048 }) {
  if (!provider || !apiKey) {
    throw new Error('provider and apiKey are required');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    switch (provider) {
      case 'anthropic': {
        const client = new Anthropic({ apiKey });
        const message = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }, { signal: controller.signal });
        return message.content[0].text;
      }

      case 'openai': {
        const client = new OpenAI({ apiKey });
        const completion = await client.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }, { signal: controller.signal });
        return completion.choices[0].message.content;
      }

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
