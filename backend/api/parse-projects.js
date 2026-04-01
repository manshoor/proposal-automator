import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import pool from '../db/pool.js';
import { callLLM } from '../lib/llm.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
  return file.buffer.toString('utf-8');
}

/**
 * POST /api/parse-projects
 * Upload a PDF/DOCX/TXT with project portfolio → LLM extracts structured projects → bulk insert.
 */
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Send a PDF, DOCX, or TXT file as "file".' });
  }

  const { provider, apiKey } = req.body;
  if (!provider || !apiKey) {
    return res.status(400).json({ error: 'provider and apiKey are required.' });
  }

  let rawText;
  try {
    rawText = await extractText(req.file);
  } catch (err) {
    return res.status(400).json({ error: 'Could not parse file: ' + err.message });
  }

  if (!rawText || rawText.trim().length < 20) {
    return res.status(400).json({ error: 'Could not extract meaningful text from the file.' });
  }

  const text = rawText.substring(0, 12000);

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
  try {
    llmResponse = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 4096 });
  } catch (err) {
    const status = err.status || err.statusCode;
    if (status === 401) return res.status(401).json({ error: 'Invalid API key.' });
    if (status === 429) return res.status(429).json({ error: 'Rate limit reached.' });
    return res.status(502).json({ error: 'LLM failed to process the document.' });
  }

  let projects;
  try {
    let cleaned = llmResponse.trim();
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    projects = JSON.parse(cleaned);
    if (!Array.isArray(projects)) {
      projects = [projects];
    }
  } catch (err) {
    console.error('LLM JSON parse error:', err.message, 'Raw:', llmResponse.substring(0, 300));
    return res.status(502).json({ error: 'LLM returned invalid JSON. Try again.' });
  }

  // Bulk insert
  const inserted = [];
  for (const p of projects) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO projects (name, description, url, technologies, category, client_name, budget_range, duration, outcome)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          p.name || 'Untitled Project',
          p.description || '',
          p.url || null,
          Array.isArray(p.technologies) ? p.technologies : [],
          p.category || 'Other',
          p.client_name || '',
          p.budget_range || '',
          p.duration || '',
          p.outcome || '',
        ]
      );
      inserted.push(rows[0]);
    } catch (dbErr) {
      console.error('Insert project error:', dbErr.message);
    }
  }

  res.json({
    parsed: projects.length,
    inserted: inserted.length,
    projects: inserted,
  });
});

export default router;
