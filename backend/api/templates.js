import { Router } from 'express';
import pool from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { ValidationError, NotFoundError, ExternalServiceError } from '../lib/errors.js';

const router = Router();

/**
 * Extracts all {variableName} placeholders from a template string.
 * @param {string} content
 * @returns {string[]}
 */
function extractVariables(content) {
  const matches = content.matchAll(/\{(\w+)\}/g);
  const variables = [...new Set([...matches].map((m) => m[1]))];
  return variables;
}

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM templates ORDER BY created_at DESC');
  return res.json(rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM templates WHERE id = $1', [req.params.id]);

  if (rows.length === 0) {
    throw new NotFoundError('Template');
  }

  return res.json(rows[0]);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, content, is_default } = req.body;

  if (!name || !content) {
    throw new ValidationError('name and content are required');
  }

  const variables = extractVariables(content);

  const { rows } = await pool.query(
    `INSERT INTO templates (name, content, variables, is_default)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, content, variables, is_default ?? false]
  );

  return res.status(201).json(rows[0]);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, content, is_default } = req.body;
  const { id } = req.params;

  const existing = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new NotFoundError('Template');
  }

  const updatedContent = content ?? existing.rows[0].content;
  const variables = extractVariables(updatedContent);

  const { rows } = await pool.query(
    `UPDATE templates SET
      name = COALESCE($1, name),
      content = $2,
      variables = $3,
      is_default = COALESCE($4, is_default),
      updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [name ?? null, updatedContent, variables, is_default ?? null, id]
  );

  return res.json(rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'DELETE FROM templates WHERE id = $1 RETURNING id',
    [req.params.id]
  );

  if (rows.length === 0) {
    throw new NotFoundError('Template');
  }

  return res.status(204).send();
}));

export default router;
