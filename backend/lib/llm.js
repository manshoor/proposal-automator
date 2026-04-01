import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/**
 * @param {{ provider: string, apiKey: string, systemPrompt: string, userPrompt: string, maxTokens?: number }} options
 * @returns {Promise<string>}
 */
export async function callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens = 2048 }) {
  if (!provider || !apiKey) {
    throw new Error('provider and apiKey are required');
  }

  switch (provider) {
    case 'anthropic': {
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
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
      });
      return completion.choices[0].message.content;
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
