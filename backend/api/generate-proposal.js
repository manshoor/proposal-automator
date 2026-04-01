import { Router } from 'express';
import pool from '../db/pool.js';
import { callLLM } from '../lib/llm.js';
import { validateRequired } from '../lib/validators.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/proposal.js';

const router = Router();

const DEFAULT_PROFILE = {
  id: null,
  full_name: '',
  title: '',
  summary: '',
  skills: [],
  experience: '',
  portfolio: '',
  default_hourly_rate: 50.0,
};

router.post('/', async (req, res) => {
  const { jobData, hiddenInstructions, provider, apiKey, templateContent, extraInstruction, existingProposal } = req.body;

  // Validate top-level required fields
  const topLevel = validateRequired(['provider', 'apiKey'], req.body);
  if (!topLevel.valid) {
    return res.status(400).json({ error: topLevel.errors.join(', ') });
  }

  // Validate jobData fields
  if (!jobData || typeof jobData !== 'object') {
    return res.status(400).json({ error: 'jobData is required' });
  }

  const jobValidation = validateRequired(['title', 'description'], jobData);
  if (!jobValidation.valid) {
    return res.status(400).json({ error: `jobData: ${jobValidation.errors.join(', ')}` });
  }

  // Fetch profile (use default if none exists)
  let profile = DEFAULT_PROFILE;
  try {
    const { rows } = await pool.query('SELECT * FROM profiles LIMIT 1');
    if (rows.length > 0) {
      profile = rows[0];
    }
  } catch (dbErr) {
    console.error('Failed to fetch profile:', dbErr.message);
    // Non-fatal — fall through with default profile
  }

  // Build prompts
  const systemPrompt = buildSystemPrompt(profile);
  let userPrompt = buildUserPrompt(jobData, hiddenInstructions);

  // Append template if provided
  if (templateContent) {
    userPrompt += `\n\nUSE THIS TEMPLATE AS A STRUCTURAL GUIDE for the cover letter. Fill in the variables with appropriate content based on the job:\n${templateContent}`;
  }

  // Quick-edit: refine existing proposal with instruction
  if (extraInstruction && existingProposal) {
    userPrompt += `\n\nIMPORTANT: Here is the existing proposal. Rewrite it following this instruction: "${extraInstruction}"\n\nEXISTING PROPOSAL:\n${existingProposal}`;
  } else if (extraInstruction) {
    userPrompt += `\n\nADDITIONAL INSTRUCTION: ${extraInstruction}`;
  }

  // Call LLM
  let rawResponse;
  try {
    rawResponse = await callLLM({
      provider,
      apiKey,
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
    });
  } catch (llmErr) {
    const status = llmErr.status || llmErr.statusCode;
    if (status === 401) {
      return res.status(401).json({ error: 'Invalid API key. Please check your settings.' });
    }
    if (status === 429) {
      return res.status(429).json({ error: 'API rate limit reached. Please try again shortly.' });
    }
    console.error('LLM error:', llmErr.message);
    return res.status(502).json({ error: 'Failed to generate proposal. Please try again.' });
  }

  // Parse structured output
  const coverLetterMatch = rawResponse.match(/COVER_LETTER:\s*([\s\S]*?)(?=HOURLY_RATE:|$)/i);
  const hourlyRateMatch = rawResponse.match(/HOURLY_RATE:\s*([0-9]+(?:\.[0-9]{1,2})?)/i);

  const coverLetter = coverLetterMatch ? coverLetterMatch[1].trim() : rawResponse.trim();
  const hourlyRate = hourlyRateMatch
    ? parseFloat(hourlyRateMatch[1])
    : profile.default_hourly_rate || 50.0;

  // Parse milestones (for fixed-price jobs)
  const milestones = [];
  const milestonesSection = rawResponse.match(/MILESTONES:\s*([\s\S]*?)(?=BUDGET_WARNING:|$)/i);
  if (milestonesSection) {
    const lines = milestonesSection[1].trim().split('\n').filter(l => l.trim());
    console.log('[Milestones] Raw lines:', lines);
    for (const line of lines) {
      // Try multiple formats:
      // "1. Description | $200"
      // "1. Description - $200"
      // "1. Description — $200"
      // "1. Description $200"
      let m = line.match(/^\d+[\.\)]\s*(.+?)\s*[\|–—-]\s*\$?([\d,.]+)/);
      if (!m) {
        // Fallback: description followed by dollar amount at end of line
        m = line.match(/^\d+[\.\)]\s*(.+?)\s+\$?([\d,.]+)\s*$/);
      }
      if (m) {
        milestones.push({
          description: m[1].replace(/[\|–—-]\s*$/, '').trim(),
          amount: parseFloat(m[2].replace(/,/g, ''))
        });
      }
    }
    console.log('[Milestones] Parsed:', milestones);
  }

  // Parse budget warning
  const budgetWarningMatch = rawResponse.match(/BUDGET_WARNING:\s*(.+)/i);
  const budgetWarning = budgetWarningMatch ? budgetWarningMatch[1].trim() : null;

  // Persist proposal
  let proposalId = null;
  try {
    const insertResult = await pool.query(
      `INSERT INTO proposals (
        job_url, job_title, job_description,
        job_budget_type, job_budget_min, job_budget_max, job_budget_amount,
        job_skills, client_location, client_total_spent, client_hire_rate,
        client_review_count, proposal_text, hourly_rate,
        hidden_instructions, vetting_result, proposal_count
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      ) RETURNING id`,
      [
        jobData.url || '',
        jobData.title,
        jobData.description,
        jobData.budgetType || null,
        jobData.budgetMin || null,
        jobData.budgetMax || null,
        jobData.budgetAmount || null,
        jobData.skills || [],
        jobData.clientLocation || null,
        jobData.clientTotalSpent || null,
        jobData.clientHireRate || null,
        jobData.clientReviewCount || null,
        coverLetter,
        hourlyRate,
        hiddenInstructions?.text || null,
        jobData.vettingResult ? JSON.stringify(jobData.vettingResult) : null,
        jobData.proposalCount || null,
      ]
    );
    proposalId = insertResult.rows[0].id;
  } catch (dbErr) {
    console.error('Failed to save proposal:', dbErr.message);
    // Non-fatal — still return the generated content
  }

  return res.status(200).json({ coverLetter, hourlyRate, milestones, budgetWarning, proposalId });
});

// ---- A/B Testing: Generate two variants ----
router.post('/ab', async (req, res) => {
  const { jobData, hiddenInstructions, provider, apiKey, templateContent } = req.body;

  const topLevel = validateRequired(['provider', 'apiKey'], req.body);
  if (!topLevel.valid) return res.status(400).json({ error: topLevel.errors.join(', ') });
  if (!jobData || !jobData.title || !jobData.description) {
    return res.status(400).json({ error: 'jobData with title and description is required' });
  }

  let profile = DEFAULT_PROFILE;
  try {
    const { rows } = await pool.query('SELECT * FROM profiles LIMIT 1');
    if (rows.length > 0) profile = rows[0];
  } catch (e) { /* use default */ }

  const systemPrompt = buildSystemPrompt(profile);
  const baseUserPrompt = buildUserPrompt(jobData, hiddenInstructions);

  // Variant A: Direct & confident tone
  const promptA = baseUserPrompt + '\n\nSTYLE INSTRUCTION: Write in a direct, confident, no-nonsense tone. Lead with your strongest qualification. Be assertive.';
  // Variant B: Consultative & question-led tone
  const promptB = baseUserPrompt + '\n\nSTYLE INSTRUCTION: Write in a consultative, thoughtful tone. Open with an insightful question about their project. Show curiosity and depth.';

  if (templateContent) {
    // Both use the template as a guide
    const templateSuffix = '\n\nUSE THIS TEMPLATE AS A STRUCTURAL GUIDE:\n' + templateContent;
    // Already appended per variant below
  }

  try {
    // Generate both variants in parallel
    const [rawA, rawB] = await Promise.all([
      callLLM({ provider, apiKey, systemPrompt, userPrompt: promptA + (templateContent ? '\n\nUSE THIS TEMPLATE AS A STRUCTURAL GUIDE:\n' + templateContent : ''), maxTokens: 2048 }),
      callLLM({ provider, apiKey, systemPrompt, userPrompt: promptB + (templateContent ? '\n\nUSE THIS TEMPLATE AS A STRUCTURAL GUIDE:\n' + templateContent : ''), maxTokens: 2048 }),
    ]);

    // Parse both
    function parseLLMResponse(raw) {
      const clMatch = raw.match(/COVER_LETTER:\s*([\s\S]*?)(?=HOURLY_RATE:|$)/i);
      const hrMatch = raw.match(/HOURLY_RATE:\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
      const msSection = raw.match(/MILESTONES:\s*([\s\S]*?)(?=BUDGET_WARNING:|$)/i);
      const milestones = [];
      if (msSection) {
        const lines = msSection[1].trim().split('\n').filter(l => l.trim());
        for (const line of lines) {
          let m = line.match(/^\d+[\.\)]\s*(.+?)\s*[\|–—-]\s*\$?([\d,.]+)/);
          if (!m) m = line.match(/^\d+[\.\)]\s*(.+?)\s+\$?([\d,.]+)\s*$/);
          if (m) milestones.push({ description: m[1].replace(/[\|–—-]\s*$/, '').trim(), amount: parseFloat(m[2].replace(/,/g, '')) });
        }
      }
      return {
        coverLetter: clMatch ? clMatch[1].trim() : raw.trim(),
        hourlyRate: hrMatch ? parseFloat(hrMatch[1]) : profile.default_hourly_rate || 50,
        milestones,
      };
    }

    const variantA = parseLLMResponse(rawA);
    const variantB = parseLLMResponse(rawB);

    res.status(200).json({
      variantA: { ...variantA, style: 'Direct & Confident' },
      variantB: { ...variantB, style: 'Consultative & Thoughtful' },
    });
  } catch (err) {
    const status = err.status || err.statusCode;
    if (status === 401) return res.status(401).json({ error: 'Invalid API key.' });
    if (status === 429) return res.status(429).json({ error: 'Rate limit reached.' });
    console.error('A/B generation error:', err.message);
    res.status(502).json({ error: 'Failed to generate variants.' });
  }
});

export default router;
