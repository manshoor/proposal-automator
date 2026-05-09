// @ts-nocheck — TODO: tighten types in a follow-up iter
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as profileRepo from '../repositories/profile.repository.js';
import * as projectRepo from '../repositories/project.repository.js';
import { resolveLLMConfig, callLLM } from './llm.service.js';
import { ValidationError, ExternalServiceError } from '../lib/errors.js';

/**
 * Extracts plain text from an uploaded file buffer.
 * Supports PDF, DOCX/DOC, and plain text (UTF-8 fallback).
 *
 * @param {{ originalname: string, buffer: Buffer }} file
 * @returns {Promise<string>}
 */
async function extractText(file) {
  const ext = (file.originalname || '').toLowerCase();

  if (ext.endsWith('.pdf')) {
    const data = await pdfParse(file.buffer);
    return data.text || '';
  }

  if (ext.endsWith('.docx') || ext.endsWith('.doc')) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value || '';
  }

  // Plain text fallback
  return file.buffer.toString('utf-8');
}

/**
 * Parses a resume file using LLM to extract structured profile data and projects.
 * Optionally auto-saves profile and/or projects to the database.
 *
 * @param {{ originalname: string, buffer: Buffer }} file
 * @param {object} options
 * @param {boolean|string} [options.autoSave]     - Save profile to DB if true
 * @param {boolean|string} [options.saveProjects] - Save projects to DB if true
 * @param {string}  [options.provider]
 * @param {string}  [options.apiKey]
 * @param {object|null} logger  - Pino-compatible logger or null
 * @param {string|null} userId
 * @returns {Promise<{ profile, projects, savedProjects, rawTextLength }>}
 */
export async function parseResume(file, options, logger = null, userId = null) {
  const { autoSave, saveProjects } = options;

  // 1. Resolve LLM config
  const { provider, apiKey } = await resolveLLMConfig(options, userId);

  // 2. Extract text from file
  let rawText;
  try {
    rawText = await extractText(file);
  } catch (err) {
    throw new ValidationError('Could not parse the uploaded file: ' + err.message);
  }

  if (!rawText || rawText.trim().length < 20) {
    throw new ValidationError('Could not extract meaningful text from the file.');
  }

  // Truncate to ~8000 chars to fit in LLM context
  const text = rawText.substring(0, 8000);

  // 3. Call LLM with resume parsing prompt
  const systemPrompt = `You are a resume parser. Extract structured profile information AND any projects/portfolio items from the resume text. Return ONLY valid JSON with these exact fields:

{
  "full_name": "Person's full name",
  "title": "Professional title/headline (e.g. 'Full-Stack Developer')",
  "summary": "2-3 sentence professional summary suitable for an Upwork profile",
  "skills": ["skill1", "skill2", "skill3"],
  "experience": "Key experience highlights, formatted as a concise paragraph",
  "portfolio": "Notable projects, achievements, or portfolio highlights",
  "default_hourly_rate": 50,
  "projects": [
    {
      "name": "Project name",
      "description": "What was built, the challenge, and the result",
      "technologies": ["React", "Node.js"],
      "category": "Web Development",
      "client_name": "Client or company if mentioned",
      "outcome": "Results or metrics if mentioned",
      "url": "URL if mentioned"
    }
  ]
}

Rules:
- Extract real data from the resume, don't fabricate
- Skills should be specific technical skills (e.g. "React", "Node.js", "Python"), not soft skills
- Summary should be written in first person, optimized for freelancing
- Experience should highlight the most impressive and relevant achievements
- Portfolio should list notable projects with brief descriptions
- For hourly rate, estimate based on experience level and skills (junior: 25-40, mid: 40-75, senior: 75-150)
- For projects: extract EVERY project, portfolio item, or notable work mentioned in the resume
- Project category should be one of: Web Development, Mobile App, E-commerce, UI/UX Design, API/Backend, WordPress/CMS, Data/Automation, Other
- If no projects are found, set "projects" to an empty array []
- Return ONLY the JSON object, no markdown fences, no explanation`;

  const userPrompt = `Parse this resume and extract the profile data:\n\n${text}`;

  let llmResponse;
  llmResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 2048 });

  // 4. Parse JSON response
  let profileData;
  try {
    let cleaned = llmResponse.trim();
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    profileData = JSON.parse(cleaned);
  } catch {
    throw new ExternalServiceError('LLM', 'LLM returned invalid response. Try again.');
  }

  // 5. Normalize profile + projects
  const profile = {
    full_name: profileData.full_name || '',
    title: profileData.title || '',
    summary: profileData.summary || '',
    skills: Array.isArray(profileData.skills) ? profileData.skills : [],
    experience: profileData.experience || '',
    portfolio: profileData.portfolio || '',
    default_hourly_rate: parseFloat(profileData.default_hourly_rate) || 50,
  };

  const projects = Array.isArray(profileData.projects)
    ? profileData.projects.map(p => ({
        name: p.name || '',
        description: p.description || '',
        technologies: Array.isArray(p.technologies) ? p.technologies : [],
        category: p.category || 'Other',
        client_name: p.client_name || '',
        outcome: p.outcome || '',
        url: p.url || '',
      })).filter(p => p.name)
    : [];

  // 6. Auto-save profile if requested
  if (autoSave === 'true' || autoSave === true) {
    try {
      const existing = await profileRepo.findFirst(userId);
      if (existing) {
        await profileRepo.update(existing.id, profile, userId);
      } else {
        await profileRepo.create(profile, userId);
      }
    } catch (dbErr) {
      logger?.error({ err: dbErr }, 'Auto-save failed');
      // Non-fatal — still return the parsed data
    }
  }

  // 7. Batch-save projects if requested
  let savedProjects = [];
  if ((saveProjects === 'true' || saveProjects === true) && projects.length > 0) {
    try {
      savedProjects = await projectRepo.createMany(projects, userId);
    } catch (dbErr) {
      logger?.error({ err: dbErr }, 'Batch save projects failed');
    }
  }

  return { profile, projects, savedProjects, rawTextLength: text.length };
}

/**
 * Parses a portfolio document using LLM to extract structured projects, then bulk inserts.
 *
 * @param {{ originalname: string, buffer: Buffer }} file
 * @param {object} requestBody  - May contain provider, apiKey
 * @param {object|null} logger  - Pino-compatible logger or null
 * @param {string|null} userId
 * @returns {Promise<{ parsed: number, inserted: number, projects: object[] }>}
 */
export async function parseProjects(file, requestBody, logger = null, userId = null) {
  // 1. Extract text
  let rawText;
  try {
    rawText = await extractText(file);
  } catch (err) {
    throw new ValidationError('Could not parse file: ' + err.message);
  }

  if (!rawText || rawText.trim().length < 20) {
    throw new ValidationError('Could not extract meaningful text from the file.');
  }

  const text = rawText.substring(0, 12000);

  // 2. Resolve LLM config
  const { provider, apiKey } = await resolveLLMConfig(requestBody, userId);

  // 3. Call LLM with project parsing prompt
  const systemPrompt = `You are a portfolio parser. Extract ALL projects from the document text provided. Return ONLY a valid JSON array of project objects.

Each project object must have these fields:
{
  "name": "Project name",
  "description": "2-4 sentence description of what was built and the challenge solved",
  "technologies": ["React", "Node.js", "PostgreSQL"],
  "category": "one of: Web Development, Mobile App, E-commerce, UI/UX Design, API/Backend, WordPress/CMS, Data/Automation, Other",
  "client_name": "Client or company name if mentioned, otherwise empty string",
  "budget_range": "Budget if mentioned, otherwise empty string",
  "duration": "Duration if mentioned, otherwise empty string",
  "outcome": "Results/metrics if mentioned (e.g. 'Increased conversions by 35%'), otherwise empty string",
  "url": "URL if mentioned, otherwise empty string"
}

Rules:
- Extract EVERY project you can find in the document
- Technologies should be specific (e.g. "React" not "frontend framework")
- Pick the best matching category from the list
- If the document is a spreadsheet-like format, each row is likely a separate project
- Return ONLY the JSON array, no markdown fences, no explanation
- If you find no projects, return an empty array []`;

  const userPrompt = `Extract all projects from this document:\n\n${text}`;

  let llmResponse;
  llmResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 4096 });

  // 4. Parse JSON
  let projects;
  try {
    let cleaned = llmResponse.trim();
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    projects = JSON.parse(cleaned);
    if (!Array.isArray(projects)) {
      projects = [projects];
    }
  } catch {
    throw new ExternalServiceError('LLM', 'LLM returned invalid response. Try again.');
  }

  // 5. Batch insert all projects in a single query
  let inserted = [];
  try {
    inserted = await projectRepo.createMany(projects, userId);
  } catch (dbErr) {
    logger?.error({ err: dbErr }, 'Batch insert projects error');
  }

  return {
    parsed: projects.length,
    inserted: inserted.length,
    projects: inserted,
  };
}