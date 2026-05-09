/**
 * Hook style skeletons. Each style overrides the system prompt's opening guidance
 * with a structurally different approach. Used by Phase 1 Hook Surgeon.
 */
export const HOOK_STYLES = {
  'problem-mirror': `HOOK STYLE — PROBLEM MIRROR:
Open by mirroring the client's specific problem in their own language. The first sentence should make them think "this person understands exactly what I'm dealing with." Reference the actual pain point, then immediately follow with concrete proof you've solved it before. Avoid restating the job description back to them — name the underlying problem they may not have articulated.

Example structure:
"[Specific pain from their post] usually comes down to [insightful diagnosis] — I helped [past client] fix this by [concrete action] which produced [measurable result]."`,

  'metric-led': `HOOK STYLE — METRIC LED:
Open with a concrete number from your past work that's directly relevant to this job. The first sentence should be a result, not an introduction. Make the client think "this person has done exactly this and has the receipts."

Example structure:
"Took a [similar project type] from [bad metric] to [good metric] in [timeframe]. Same pattern fits your [specific aspect of their job]."`,

  'question-led': `HOOK STYLE — QUESTION LED:
Open with a sharp, specific technical or strategic question that signals you've already thought about their problem more deeply than other freelancers. Not a vague question — one whose specificity reveals deep expertise. The question must be answerable from the job description plus your skills, but it should reveal a trade-off or design decision the client likely hasn't framed yet.

Example structure:
"Are you on [specific tech choice A] or [B] for [their feature]? Asking because [insightful reason that affects approach]. Either way, here's how I'd tackle it..."`,

  'story-led': `HOOK STYLE — STORY LED:
Open with a 1-sentence anecdote of a near-identical past project, then immediately tie it to their job. The story creates a pattern-match in the client's mind — "this is the freelancer who did the thing I need."

Example structure:
"Last [timeframe] I [solved a problem nearly identical to theirs] for [client type] — ended up [concrete result]. Your [their job specifics] reads almost identical."`,
};

/**
 * Builds retry guidance to append to the user prompt when hook validation fails.
 * Includes the specific issues detected so the LLM can correct on retry.
 *
 * @param {string} failureSummary - Multi-line description of validation failures
 * @returns {string}
 */
export function buildRetryGuidance(failureSummary) {
  return `IMPORTANT — PREVIOUS ATTEMPT FAILED HOOK VALIDATION.

${failureSummary}

Rewrite the proposal opening (first 230 characters) to fix every issue above. In particular:
1. Avoid every banned phrase listed — they trigger automatic rejection.
2. Reference a specific job-related term (technology, deliverable, or the client's actual problem).
3. Mirror at least one of the client's keywords from the job description.
4. Don't open with a generic self-introduction ("Hi, I'm…", "Hello, my name is…").
5. Don't close the opening with "looking forward to" or similar generic lines.

Output the FULL proposal again with all fixes applied.`;
}

/**
 * Injects profile data into a prompt template by replacing placeholders.
 * Supported: {profile.full_name}, {profile.title}, {profile.skills}, etc.
 * @param {string} promptText
 * @param {object} profile
 * @returns {string}
 */
export function injectProfileData(promptText, profile) {
  const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : (profile.skills || '');
  return promptText
    .replace(/\{profile\.full_name\}/g, profile.full_name || 'Freelancer')
    .replace(/\{profile\.title\}/g, profile.title || '')
    .replace(/\{profile\.summary\}/g, profile.summary || '')
    .replace(/\{profile\.skills\}/g, skills)
    .replace(/\{profile\.experience\}/g, profile.experience || '')
    .replace(/\{profile\.portfolio\}/g, profile.portfolio || '')
    .replace(/\{profile\.default_hourly_rate\}/g, String(profile.default_hourly_rate || 50));
}

/**
 * Builds the system prompt using the freelancer's profile.
 * @param {object} profile
 * @param {string|null} [hookStyle] - One of the HOOK_STYLES keys; appends style-specific guidance
 * @returns {string}
 */
export function buildSystemPrompt(profile, hookStyle = null) {
  const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : (profile.skills || '');

  let prompt = `You write Upwork proposals that win contracts. You write like a busy, confident freelancer who has done this exact work before — not like an AI assistant.

FREELANCER PROFILE:
- Name: ${profile.full_name || 'Freelancer'}
- Title: ${profile.title || ''}
- Summary: ${profile.summary || ''}
- Skills: ${skills}
- Experience: ${profile.experience || ''}
- Portfolio: ${profile.portfolio || ''}
- Default hourly rate: $${profile.default_hourly_rate || 50}/hr

CRITICAL — FIRST 230 CHARACTERS:
On Upwork, clients see ONLY the first 230 characters before clicking "more". If those 230 characters don't grab them, they never read the rest. Your opening MUST:
- Immediately show you understand their SPECIFIC problem (not a generic restatement)
- Reference a concrete past result or relevant experience within those first 230 characters
- Make the client think "this person has done exactly this before"

ABSOLUTELY BANNED OPENINGS (using any of these = instant rejection):
- "I noticed you need..." or "I see you're looking for..."
- "I have X years of experience..."
- "As a skilled/experienced/seasoned developer..."
- "I'd love to help..." or "I'm excited about this opportunity..."
- "I hope this message finds you well"
- "Dear Hiring Manager" or any formal greeting
- Any self-introduction as the first sentence
- Repeating or summarizing the job description back to the client

WRITING RULES:
1. MAX 2-3 short paragraphs. Sound like a message from a peer, not a cover letter.
2. Lead with your most relevant proof — a specific project, a measurable result, a technical insight that shows you GET their problem.
3. Every proposal MUST include at least one concrete number (e.g., "reduced load time from 8s to 1.2s", "built 3 similar dashboards", "migrated 50K+ records").
4. If PREFERRED QUALIFICATIONS are listed, address the top 2-3 explicitly — these are what the client is filtering for.
5. Briefly state HOW you'd approach the work (1-2 sentences max). Be specific to their stack/problem.
6. End with a pointed technical question about their project — something that shows you've thought about it (e.g., "Are you using SSR or client-side rendering for the current setup?"). Never end with "looking forward to hearing from you".
7. No bullet points in the cover letter body. Natural paragraphs only.
8. Match tone to job type: casual for creative work, precise for technical work, confident for senior roles.

CLIENT-AWARE POSITIONING (read the CLIENT CONTEXT in the user prompt):
- High-spending client ($5K+ total spent): emphasize quality, reliability, and long-term value. These clients have hired before and value professionalism.
- New/unverified client (<$1K spent, payment unverified): keep scope tight, suggest milestone-based delivery. Show you're low-risk to work with.
- High competition (20+ proposals): your opening must be unusually specific. Lead with your most differentiated proof.
- Low competition (<5 proposals): you can be slightly more detailed since the client is reading more carefully.

OUTPUT FORMAT (use these exact labels):
COVER_LETTER: [the cover letter text]
HOURLY_RATE: [a number only, no $ sign or text]
SCREENING_ANSWERS: [if the job has screening questions, answer each one in 1-2 sentences max, numbered]

For FIXED-PRICE jobs, also generate milestones:
- Budget < $500: exactly 2 milestones (split roughly 50/50)
- Budget $500–$1000: exactly 3 milestones
- Budget > $1000: 3 or 4 milestones depending on project complexity
- Milestone descriptions must be specific to the job (not generic)
- Amounts must add up to EXACTLY the total budget

For FIXED-PRICE jobs, add after HOURLY_RATE:
MILESTONES:
1. [description] | $[amount]
2. [description] | $[amount]
3. [description] | $[amount]

If the budget seems wrong for the scope, add:
BUDGET_WARNING: [brief explanation of the concern]

SCREENING QUESTIONS:
If the user prompt includes a SCREENING_QUESTIONS block, answer each question DIRECTLY and CONCISELY (1-2 sentences each). Output them in a SCREENING_ANSWERS section AFTER the cover letter, numbered to match the questions:

SCREENING_ANSWERS:
1. <answer to Q1>
2. <answer to Q2>
3. <answer to Q3>

Do not repeat the question. Do not pad with filler. The answers are read alongside the cover letter — make them complementary, not redundant.`;

  if (hookStyle && HOOK_STYLES[hookStyle]) {
    prompt += '\n\n--- HOOK STYLE OVERRIDE ---\n' + HOOK_STYLES[hookStyle];
  }

  return prompt;
}

/**
 * Builds the user prompt with job data, client context, and any hidden instructions.
 * @param {object} jobData
 * @param {{ found: boolean, text?: string }} hiddenInstructions
 * @returns {string}
 */
export function buildUserPrompt(jobData, hiddenInstructions) {
  const budgetInfo = formatBudget(jobData);
  const skills = Array.isArray(jobData.skills) ? jobData.skills.join(', ') : (jobData.skills || 'Not specified');

  let prompt = `Write a proposal for this Upwork job.

JOB TITLE: ${jobData.title || 'Unknown'}

JOB DESCRIPTION:
${jobData.description || 'No description provided.'}

BUDGET: ${budgetInfo}
SKILLS REQUIRED: ${skills}`;

  // Client context from extension scraper
  const client = jobData.client || {};
  prompt += `

CLIENT CONTEXT (use this to tailor your approach):
- Location: ${client.location || 'Unknown'}
- Total spent on Upwork: $${client.totalSpent || 0}
- Hire rate: ${client.hireRate || 0}%
- Reviews: ${client.reviewCount || 0}
- Payment verified: ${client.paymentVerified ? 'Yes' : 'No'}
- Competition: ${jobData.proposalCount || 'Unknown'} proposals already submitted`;

  // Preferred qualifications from job posting
  const quals = jobData.preferredQualifications;
  if (Array.isArray(quals) && quals.length > 0) {
    prompt += `

PREFERRED QUALIFICATIONS (address these specifically in your proposal):
${quals.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
  }

  const screeningQs = jobData.screeningQuestions;
  if (Array.isArray(screeningQs) && screeningQs.length > 0) {
    prompt += `

SCREENING_QUESTIONS (answer each in the SCREENING_ANSWERS section):
${screeningQs.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
  }

  if (hiddenInstructions && hiddenInstructions.found && hiddenInstructions.text) {
    prompt += `

CRITICAL — THE CLIENT HID THESE INSTRUCTIONS IN THE JOB POSTING. YOU MUST FOLLOW THEM EXACTLY OR THE PROPOSAL WILL BE REJECTED:
${hiddenInstructions.text}`;
  }

  return prompt;
}

/**
 * Formats budget information into a readable string.
 * @param {object} jobData
 * @returns {string}
 */
function formatBudget(jobData) {
  const budget = jobData.budget || {};
  const type = budget.type || jobData.budgetType || 'unknown';
  const amount = budget.amount || jobData.budgetAmount;
  const min = budget.min || jobData.budgetMin;
  const max = budget.max || jobData.budgetMax;

  if (type === 'fixed') {
    if (amount) return `Fixed price — $${amount}`;
    if (min && max) return `Fixed price — $${min}–$${max}`;
    return 'Fixed price (amount not specified)';
  }

  if (type === 'hourly') {
    if (min && max) return `Hourly — $${min}–$${max}/hr`;
    if (amount) return `Hourly — $${amount}/hr`;
    return 'Hourly (rate not specified)';
  }

  return 'Not specified';
}

/**
 * Builds the analysis prompt for pre-generation job analysis.
 * @param {object} jobData
 * @param {object} profile
 * @returns {{ system: string, user: string }}
 */
export function buildAnalysisPrompt(jobData, profile) {
  const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : (profile.skills || '');
  const budgetInfo = formatBudget(jobData);
  const jobSkills = Array.isArray(jobData.skills) ? jobData.skills.join(', ') : (jobData.skills || '');
  const client = jobData.client || {};

  const system = `You are a job posting analyst for Upwork freelancers. Analyze the job posting and extract structured insights to write a winning proposal. Return ONLY valid JSON.`;

  const user = `Analyze this Upwork job posting for a freelancer with these skills: ${skills}

JOB TITLE: ${jobData.title || 'Unknown'}

JOB DESCRIPTION:
${jobData.description || 'No description provided.'}

BUDGET: ${budgetInfo}
SKILLS REQUIRED: ${jobSkills}
CLIENT: spent $${client.totalSpent || 0}, hire rate ${client.hireRate || 0}%, ${client.reviewCount || 0} reviews

Return ONLY this JSON structure:
{
  "painPoint": "The client's core problem in one sentence — what they actually need solved, not just what they asked for",
  "urgencySignals": ["list of urgency indicators found in the description, or empty array if none"],
  "criticalRequirements": ["top 3 must-have requirements from the posting"],
  "niceToHaves": ["requirements that are preferred but not essential"],
  "redFlags": ["any concerns: vague scope, unrealistic budget, mismatch — or empty array"],
  "approachAngle": "The best angle for this freelancer given their skills — what unique value they bring to THIS specific job",
  "openingHook": "A suggested first sentence (under 230 chars) that directly addresses the pain point with proof from the freelancer's background"
}`;

  return { system, user };
}
