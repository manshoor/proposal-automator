/**
 * Prompt builders for the AI Message Copilot.
 */

/**
 * Builds the system prompt using the freelancer's profile.
 * @param {object} profile
 * @returns {string}
 */
export function buildMessageSystemPrompt(profile) {
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

/**
 * Builds the user prompt for generating a reply message.
 * @param {Array<{sender: string, text: string}>} conversationHistory
 * @param {string} jobTitle
 * @param {string} tone  'professional' | 'friendly' | 'brief'
 * @returns {string}
 */
export function buildMessageUserPrompt(conversationHistory, jobTitle, tone) {
  const formattedMessages = (conversationHistory || [])
    .map(function (msg) {
      var label = msg.sender === 'me' ? 'Me' : 'Client';
      return label + ': ' + (msg.text || '').trim();
    })
    .join('\n\n');

  const toneGuide = {
    professional: 'a professional tone. Keep it concise (3-6 sentences).',
    friendly: 'a friendly, warm tone. Keep it concise (2-5 sentences).',
    brief: 'a brief, direct tone. Keep it very short (2-4 sentences).',
  };

  const toneInstruction = toneGuide[tone] || toneGuide['professional'];
  const jobLine = jobTitle ? `\nJob: ${jobTitle}` : '';

  return `Here is the conversation history:

${formattedMessages || '(No previous messages)'}
${jobLine}

Write a reply in ${toneInstruction}

REPLY:
[your reply text]`;
}

/**
 * Builds the user prompt for answering a single screening question.
 * @param {string} question
 * @param {string} jobTitle
 * @param {string} tone
 * @returns {string}
 */
export function buildQuestionUserPrompt(question, jobTitle, tone) {
  const toneGuide = {
    professional: 'a professional tone. Be specific and concise (2-4 sentences).',
    friendly: 'a friendly, approachable tone. Be specific and concise (2-4 sentences).',
    brief: 'a brief, direct tone. Answer in 1-3 sentences maximum.',
  };

  const toneInstruction = toneGuide[tone] || toneGuide['professional'];
  const jobLine = jobTitle ? `\nJob: ${jobTitle}` : '';

  return `Answer the following screening question for an Upwork proposal.${jobLine}

Question: ${question}

Write an answer in ${toneInstruction}

ANSWER:
[your answer text]`;
}
