import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import pool from '../db/pool.js';
import { callLLM } from '../lib/llm.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

/**
 * Extract text from uploaded file (PDF or DOCX).
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
 * POST /api/parse-resume
 * Upload a PDF/DOCX resume → LLM extracts structured profile data → returns JSON.
 */
router.post('/', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Send a PDF, DOCX, or TXT file as "resume".' });
  }

  const { provider, apiKey } = req.body;
  if (!provider || !apiKey) {
    return res.status(400).json({ error: 'provider and apiKey are required.' });
  }

  // Extract raw text from the file
  let rawText;
  try {
    rawText = await extractText(req.file);
  } catch (err) {
    console.error('File parsing error:', err.message);
    return res.status(400).json({ error: 'Could not parse the uploaded file: ' + err.message });
  }

  if (!rawText || rawText.trim().length < 20) {
    return res.status(400).json({ error: 'Could not extract meaningful text from the file.' });
  }

  // Truncate to ~8000 chars to fit in LLM context
  const text = rawText.substring(0, 8000);

  // Ask LLM to extract structured profile
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
  try {
    llmResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 2048 });
  } catch (err) {
    const status = err.status || err.statusCode;
    if (status === 401) return res.status(401).json({ error: 'Invalid API key.' });
    if (status === 429) return res.status(429).json({ error: 'Rate limit reached.' });
    return res.status(502).json({ error: 'LLM failed to process the resume.' });
  }

  // Parse the JSON response
  let profileData;
  try {
    // Strip markdown fences if present
    let cleaned = llmResponse.trim();
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    profileData = JSON.parse(cleaned);
  } catch (err) {
    console.error('LLM JSON parse error:', err.message, 'Raw:', llmResponse.substring(0, 200));
    return res.status(502).json({ error: 'LLM returned invalid JSON. Try again.' });
  }

  // Validate and normalize
  const profile = {
    full_name: profileData.full_name || '',
    title: profileData.title || '',
    summary: profileData.summary || '',
    skills: Array.isArray(profileData.skills) ? profileData.skills : [],
    experience: profileData.experience || '',
    portfolio: profileData.portfolio || '',
    default_hourly_rate: parseFloat(profileData.default_hourly_rate) || 50,
  };

  // Extract projects
  const projects = Array.isArray(profileData.projects) ? profileData.projects.map(p => ({
    name: p.name || '',
    description: p.description || '',
    technologies: Array.isArray(p.technologies) ? p.technologies : [],
    category: p.category || 'Other',
    client_name: p.client_name || '',
    outcome: p.outcome || '',
    url: p.url || '',
  })).filter(p => p.name) : [];

  // Optionally auto-save to database
  if (req.body.autoSave === 'true' || req.body.autoSave === true) {
    try {
      const { rows } = await pool.query('SELECT id FROM profiles LIMIT 1');
      if (rows.length > 0) {
        await pool.query(
          `UPDATE profiles SET full_name = $1, title = $2, summary = $3, skills = $4,
           experience = $5, portfolio = $6, default_hourly_rate = $7, updated_at = NOW()
           WHERE id = $8`,
          [profile.full_name, profile.title, profile.summary, profile.skills,
           profile.experience, profile.portfolio, profile.default_hourly_rate, rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO profiles (full_name, title, summary, skills, experience, portfolio, default_hourly_rate)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [profile.full_name, profile.title, profile.summary, profile.skills,
           profile.experience, profile.portfolio, profile.default_hourly_rate]
        );
      }
    } catch (dbErr) {
      console.error('Auto-save failed:', dbErr.message);
      // Non-fatal — still return the parsed data
    }
  }

  // Optionally save projects to database
  let savedProjects = [];
  if ((req.body.saveProjects === 'true' || req.body.saveProjects === true) && projects.length > 0) {
    for (const p of projects) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO projects (name, description, technologies, category, client_name, outcome, url)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [p.name, p.description, p.technologies, p.category, p.client_name, p.outcome, p.url || null]
        );
        savedProjects.push(rows[0]);
      } catch (dbErr) {
        console.error('Save project failed:', dbErr.message);
      }
    }
  }

  res.json({ profile, projects, savedProjects, rawTextLength: text.length });
});

export default router;
