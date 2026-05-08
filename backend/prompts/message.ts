/**
 * Prompt builders for the AI Message Copilot.
 */

// ---- Public types ----

export type MessageTone = 'professional' | 'friendly' | 'brief' | 'rate-negotiation';

export interface ProfileForPrompt {
  full_name?: string;
  title?: string;
  skills?: string[] | string;
  default_hourly_rate?: number | string;
}

export interface ConversationMessage {
  sender: 'me' | 'client' | string;
  text?: string;
}

export interface RateNegotiationPromptOptions {
  message: string;
  jobContext?: string;
  profile?: ProfileForPrompt;
  tone?: MessageTone;
}

export interface SystemUserPrompt {
  system: string;
  user: string;
}

// ---- Rate-negotiation detection ----

const RATE_KEYWORDS = [
  'budget', 'rate', 'expensive', 'cheaper', 'lower', 'reduce', 'discount',
  'afford', 'negotiable', 'cost', 'price', 'pricing', 'too high', 'too much',
  'flexible on', 'come down', 'meet me', 'work within',
];

/**
 * Returns true when the message text contains rate/budget-related language.
 */
export function isRateNegotiationContext(messageText: unknown): boolean {
  if (!messageText || typeof messageText !== 'string') return false;
  const lower = messageText.toLowerCase();
  return RATE_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Builds system + user prompts for a rate-negotiation reply.
 * The return shape mirrors how the service consumes buildMessageSystemPrompt /
 * buildMessageUserPrompt: a { system, user } object of plain strings.
 */
export function buildRateNegotiationPrompt({
  message,
  jobContext,
  profile,
  tone = 'professional',
}: RateNegotiationPromptOptions): SystemUserPrompt {
  const system = `You are an expert Upwork freelancer responding to a client who is pushing back on rate or budget.
Your goal: HOLD your rate while staying warm and collaborative. Never apologize for your price.

PRINCIPLES:
- Anchor on value delivered, not hours worked.
- Acknowledge their constraint, then redirect to scope/timeline tradeoffs (not rate).
- If you must signal flexibility, do it via reduced scope or phased delivery — never via a straight discount.
- Close with a concrete next step (call, scoped proposal, milestone-based plan).
- Keep it 3–5 sentences. Conversational, not legalistic.

DO NOT:
- Drop your rate without a corresponding scope reduction.
- Sound defensive or apologetic.
- Use phrases like "happy to negotiate", "let me know what you can afford", "willing to lower".`;

  const profileRate = profile && profile.default_hourly_rate ? profile.default_hourly_rate : '50';
  const user = `Client message:
"""
${message}
"""

Job context: ${jobContext || '(not provided)'}
Your profile rate: $${profileRate}/hr
Tone preference: ${tone}

Draft a reply that holds the rate while offering a constructive path forward.

REPLY:
[your reply text]`;

  return { system, user };
}

/**
 * Builds the system prompt using the freelancer's profile.
 */
export function buildMessageSystemPrompt(profile: ProfileForPrompt): string {
  const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : (profile.skills || '');

  return `You are a freelancer communication assistant on Upwork. Write professional client messages that are:
- Clear and to the point
- Warm but not overly formal
- Action-oriented (propose next steps when appropriate)
- Never use generic phrases like "I hope this message finds you well"

Freelancer profile:
- Name: ${profile.full_name || 'Freelancer'}
- Title: ${profile.title || ''}
- Skills: ${skills}`;
}

const TONE_GUIDE_REPLY: Record<Exclude<MessageTone, 'rate-negotiation'>, string> = {
  professional: 'a professional tone. Keep it concise (3-6 sentences).',
  friendly: 'a friendly, warm tone. Keep it concise (2-5 sentences).',
  brief: 'a brief, direct tone. Keep it very short (2-4 sentences).',
};

/**
 * Builds the user prompt for generating a reply message.
 */
export function buildMessageUserPrompt(
  conversationHistory: ConversationMessage[] | null | undefined,
  jobTitle: string | null | undefined,
  tone: MessageTone | string,
): string {
  const formattedMessages = (conversationHistory || [])
    .map((msg) => {
      const label = msg.sender === 'me' ? 'Me' : 'Client';
      return label + ': ' + (msg.text || '').trim();
    })
    .join('\n\n');

  const toneInstruction =
    (tone in TONE_GUIDE_REPLY ? TONE_GUIDE_REPLY[tone as keyof typeof TONE_GUIDE_REPLY] : TONE_GUIDE_REPLY.professional);
  const jobLine = jobTitle ? `\nJob: ${jobTitle}` : '';

  return `Here is the conversation history:

${formattedMessages || '(No previous messages)'}
${jobLine}

Write a reply in ${toneInstruction}

REPLY:
[your reply text]`;
}

const TONE_GUIDE_QUESTION: Record<Exclude<MessageTone, 'rate-negotiation'>, string> = {
  professional: 'a professional tone. Be specific and concise (2-4 sentences).',
  friendly: 'a friendly, approachable tone. Be specific and concise (2-4 sentences).',
  brief: 'a brief, direct tone. Answer in 1-3 sentences maximum.',
};

/**
 * Builds the user prompt for answering a single screening question.
 */
export function buildQuestionUserPrompt(
  question: string,
  jobTitle: string | null | undefined,
  tone: MessageTone | string,
): string {
  const toneInstruction =
    (tone in TONE_GUIDE_QUESTION ? TONE_GUIDE_QUESTION[tone as keyof typeof TONE_GUIDE_QUESTION] : TONE_GUIDE_QUESTION.professional);
  const jobLine = jobTitle ? `\nJob: ${jobTitle}` : '';

  return `Answer the following screening question for an Upwork proposal.${jobLine}

Question: ${question}

Write an answer in ${toneInstruction}

ANSWER:
[your answer text]`;
}
