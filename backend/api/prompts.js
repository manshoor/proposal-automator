import { Router } from 'express';
import pool from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { ValidationError, NotFoundError, ExternalServiceError } from '../lib/errors.js';

const router = Router();

// GET /api/prompts — list all prompts, optionally filter by platform
router.get('/', asyncHandler(async (req, res) => {
  const { platform, active } = req.query;
  let query = 'SELECT * FROM prompts';
  const conditions = [];
  const values = [];

  if (platform) {
    values.push(platform);
    conditions.push(`(platform = $${values.length} OR platform = 'all')`);
  }
  if (active === 'true') {
    conditions.push('is_active = true');
  }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY is_default DESC, platform ASC, created_at DESC';

  const { rows } = await pool.query(query, values);
  res.json(rows);
}));

// GET /api/prompts/active/:platform — get the active prompt for a specific platform
// Returns platform-specific if exists, otherwise falls back to master (all)
router.get('/active/:platform', asyncHandler(async (req, res) => {
  const { platform } = req.params;

  // Try platform-specific first
  let { rows } = await pool.query(
    'SELECT * FROM prompts WHERE platform = $1 AND is_active = true ORDER BY is_default DESC LIMIT 1',
    [platform]
  );

  // Fall back to master prompt
  if (rows.length === 0) {
    ({ rows } = await pool.query(
      "SELECT * FROM prompts WHERE platform = 'all' AND is_active = true ORDER BY is_default DESC LIMIT 1"
    ));
  }

  if (rows.length === 0) {
    return res.json(null);
  }

  res.json(rows[0]);
}));

// GET /api/prompts/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM prompts WHERE id = $1', [req.params.id]);
  if (rows.length === 0) throw new NotFoundError('Prompt');
  res.json(rows[0]);
}));

// POST /api/prompts — create
router.post('/', asyncHandler(async (req, res) => {
  const { name, platform, prompt_text, is_active } = req.body;
  if (!name || !prompt_text) throw new ValidationError('name and prompt_text are required');

  const { rows } = await pool.query(
    `INSERT INTO prompts (name, platform, prompt_text, is_active)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, platform || 'all', prompt_text, is_active !== false]
  );
  res.status(201).json(rows[0]);
}));

// PUT /api/prompts/:id — update
router.put('/:id', asyncHandler(async (req, res) => {
  const { name, platform, prompt_text, is_active } = req.body;

  const { rows } = await pool.query(
    `UPDATE prompts SET
      name = COALESCE($1, name),
      platform = COALESCE($2, platform),
      prompt_text = COALESCE($3, prompt_text),
      is_active = COALESCE($4, is_active),
      updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [name, platform, prompt_text, is_active, req.params.id]
  );
  if (rows.length === 0) throw new NotFoundError('Prompt');
  res.json(rows[0]);
}));

// DELETE /api/prompts/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT is_default FROM prompts WHERE id = $1', [req.params.id]);
  if (rows.length > 0 && rows[0].is_default) {
    throw new ValidationError('Cannot delete the default prompt');
  }
  const { rowCount } = await pool.query('DELETE FROM prompts WHERE id = $1', [req.params.id]);
  if (rowCount === 0) throw new NotFoundError('Prompt');
  res.json({ success: true });
}));

export default router;
