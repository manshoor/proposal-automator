import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const LLM_TIMEOUT_MS = 90_000; // 90 seconds

export type LLMProvider = 'anthropic' | 'openai';

export interface CallLLMOptions {
  provider: LLMProvider;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

export async function callLLM({
  provider,
  apiKey,
  systemPrompt,
  userPrompt,
  maxTokens = 2048,
}: CallLLMOptions): Promise<string> {
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
        const block = message.content[0];
        if (block && block.type === 'text') return block.text;
        return '';
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
        return completion.choices[0]?.message?.content ?? '';
      }

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
