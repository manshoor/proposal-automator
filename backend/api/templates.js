import { Router } from 'express';
import pool from '../db/pool.js';

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

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM templates ORDER BY created_at DESC');
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/templates error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM templates WHERE id = $1', [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/templates/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.post('/', async (req, res) => {
  const { name, content, is_default } = req.body;

  if (!name || !content) {
    return res.status(400).json({ error: 'name and content are required' });
  }

  const variables = extractVariables(content);

  try {
    const { rows } = await pool.query(
      `INSERT INTO templates (name, content, variables, is_default)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, content, variables, is_default ?? false]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/templates error:', err.message);
    return res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/:id', async (req, res) => {
  const { name, content, is_default } = req.body;
  const { id } = req.params;

  try {
    const existing = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
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
  } catch (err) {
    console.error('PUT /api/templates/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM templates WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.status(204).send();
  } catch (err) {
    console.error('DELETE /api/templates/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
