import { getProfileOrDefault } from './profile.service.js';
import { resolveLLMConfig, callLLM } from './llm.service.js';
import {
  buildMessageSystemPrompt,
  buildMessageUserPrompt,
  buildQuestionUserPrompt,
  buildRateNegotiationPrompt,
  isRateNegotiationContext,
} from '../prompts/message.js';
import { ValidationError } from '../lib/errors.js';

/**
 * Generates a message reply or a screening-question answer using the LLM.
 *
 * @param {object} input
 * @param {Array}  [input.conversationHistory]  - Array of { sender: 'me'|'client', text: string }
 * @param {string} [input.jobTitle]
 * @param {string} [input.question]             - If provided, generates a screening question answer
 * @param {string} [input.tone]                 - 'professional' | 'friendly' | 'brief'
 * @param {string} [input.provider]
 * @param {string} [input.apiKey]
 * @param {string|null} userId
 * @returns {Promise<{ reply: string }>}
 */
export async function generateMessage(input, userId = null) {
  const { conversationHistory, jobTitle, question, tone } = input;

  // 1. Resolve LLM config
  const { provider, apiKey } = await resolveLLMConfig(input, userId);

  // 2. Validate conversationHistory type
  if (conversationHistory !== undefined && !Array.isArray(conversationHistory)) {
    throw new ValidationError('conversationHistory must be an array');
  }

  // 3. Fetch profile (non-fatal — falls back to default)
  const profile = await getProfileOrDefault(userId);

  const STANDARD_TONES = ['professional', 'friendly', 'brief'];
  const resolvedTone = tone && [...STANDARD_TONES, 'rate-negotiation'].includes(tone)
    ? tone
    : 'professional';

  // 4. Build prompts — rate-negotiation, screening question, or conversation reply
  //    Rate-neg is triggered explicitly via tone OR automatically when the
  //    incoming message contains rate/budget keywords (soft auto-detect).
  let systemPrompt;
  let userPrompt;

  // Determine the last client message text for keyword detection
  const lastClientText = (() => {
    if (question) return question;
    const history = conversationHistory || [];
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].sender === 'client') return history[i].text || '';
    }
    return '';
  })();

  const useRateNeg = resolvedTone === 'rate-negotiation' || isRateNegotiationContext(lastClientText);

  if (!question && useRateNeg) {
    const built = buildRateNegotiationPrompt({
      message: lastClientText,
      jobContext: jobTitle || '',
      profile,
      tone: resolvedTone,
    });
    systemPrompt = built.system;
    userPrompt = built.user;
  } else if (question) {
    systemPrompt = buildMessageSystemPrompt(profile);
    userPrompt = buildQuestionUserPrompt(question, jobTitle || '', resolvedTone !== 'rate-negotiation' ? resolvedTone : 'professional');
  } else {
    systemPrompt = buildMessageSystemPrompt(profile);
    userPrompt = buildMessageUserPrompt(conversationHistory || [], jobTitle || '', resolvedTone);
  }

  // 5. Call LLM
  const rawResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 512 });

  // 6. Extract the reply after the REPLY: or ANSWER: label; fall back to raw response
  const replyMatch = rawResponse.match(/(?:REPLY|ANSWER):\s*([\s\S]+)/i);
  const reply = replyMatch ? replyMatch[1].trim() : rawResponse.trim();

  return { reply };
}
