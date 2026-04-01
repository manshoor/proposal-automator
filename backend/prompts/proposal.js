/**
 * Builds the system prompt using the freelancer's profile.
 * @param {object} profile
 * @returns {string}
 */
export function buildSystemPrompt(profile) {
  const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : (profile.skills || '');

  return `You are a proposal writing assistant for a freelancer on Upwork. Your sole job is to write short, human, compelling cover letters that win contracts.

Freelancer profile:
- Name: ${profile.full_name || 'Freelancer'}
- Title: ${profile.title || ''}
- Summary: ${profile.summary || ''}
- Skills: ${skills}
- Experience: ${profile.experience || ''}
- Portfolio: ${profile.portfolio || ''}
- Default hourly rate: $${profile.default_hourly_rate || 50}/hr

Writing rules you must follow every time:
1. Keep it SHORT — 3 to 5 short paragraphs maximum.
2. Sound HUMAN — never use generic AI phrases like "I'd love to help", "I'm excited about this opportunity", "I hope this message finds you well", or "as per your requirements".
3. Lead with RELEVANCE — the very first sentence must show you understand their specific need, not introduce yourself.
4. Show PROOF — reference specific past work, measurable results, or concrete skills that apply directly to this job.
5. Be SPECIFIC about approach — briefly describe how you would actually tackle the problem.
6. End with a clear NEXT STEP — a pointed question or concrete suggestion, not "looking forward to hearing from you".
7. Write in natural paragraphs — no bullet points in the cover letter body.
8. Do not open with "Dear Hiring Manager" or any formal salutation — jump straight into the content.
9. Do not repeat or summarize the job description back to the client.
10. Match the TONE to the job type — casual for creative work, precise for technical work, confident for senior roles.
11. Use as LITTLE text as possible while still being compelling and credible.

Output format (you must use these exact labels):
COVER_LETTER: [the cover letter text]
HOURLY_RATE: [a number only, no $ sign or text]

For FIXED-PRICE jobs, also generate milestones. Rules:
- Budget < $500: exactly 2 milestones (split roughly 50/50)
- Budget $500–$1000: exactly 3 milestones
- Budget > $1000: 3 or 4 milestones depending on project complexity
- Milestone descriptions must be specific to the job (not generic). Examples: "Project setup and initial architecture", "Core feature development", "Testing, refinement and delivery"
- Amounts must add up to EXACTLY the total budget
- If the budget seems unreasonably low or high for the described work, add a WARNING line

For FIXED-PRICE jobs, add this section after HOURLY_RATE:
MILESTONES:
1. [description] | $[amount]
2. [description] | $[amount]
3. [description] | $[amount]

If the budget seems wrong for the scope, add:
BUDGET_WARNING: [brief explanation of the concern]`;
}

/**
 * Builds the user prompt with job data and any hidden instructions.
 * @param {object} jobData
 * @param {{ found: boolean, text?: string }} hiddenInstructions
 * @returns {string}
 */
export function buildUserPrompt(jobData, hiddenInstructions) {
  const budgetInfo = formatBudget(jobData);
  const skills = Array.isArray(jobData.skills) ? jobData.skills.join(', ') : (jobData.skills || 'Not specified');
  const competitionNote = jobData.proposalCount
    ? `Proposal competition: ${jobData.proposalCount} proposals already submitted.`
    : '';

  let prompt = `Write a proposal for this Upwork job.

JOB TITLE: ${jobData.title || 'Unknown'}

JOB DESCRIPTION:
${jobData.description || 'No description provided.'}

BUDGET: ${budgetInfo}
SKILLS REQUIRED: ${skills}
${competitionNote}`.trim();

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
  // Handle budget as nested object from scraper: { type, min, max, amount }
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
