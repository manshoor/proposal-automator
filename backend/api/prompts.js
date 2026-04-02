import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// GET /api/prompts — list all prompts, optionally filter by platform
router.get('/', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('GET /api/prompts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// GET /api/prompts/active/:platform — get the active prompt for a specific platform
// Returns platform-specific if exists, otherwise falls back to master (all)
router.get('/active/:platform', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('GET /api/prompts/active error:', err.message);
    res.status(500).json({ error: 'Failed to fetch active prompt' });
  }
});

// GET /api/prompts/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM prompts WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Prompt not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch prompt' });
  }
});

// POST /api/prompts — create
router.post('/', async (req, res) => {
  const { name, platform, prompt_text, is_active } = req.body;
  if (!name || !prompt_text) return res.status(400).json({ error: 'name and prompt_text are required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO prompts (name, platform, prompt_text, is_active)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, platform || 'all', prompt_text, is_active !== false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/prompts error:', err.message);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// PUT /api/prompts/:id — update
router.put('/:id', async (req, res) => {
  const { name, platform, prompt_text, is_active } = req.body;

  try {
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
    if (rows.length === 0) return res.status(404).json({ error: 'Prompt not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/prompts error:', err.message);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// DELETE /api/prompts/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT is_default FROM prompts WHERE id = $1', [req.params.id]);
    if (rows.length > 0 && rows[0].is_default) {
      return res.status(400).json({ error: 'Cannot delete the default prompt' });
    }
    const { rowCount } = await pool.query('DELETE FROM prompts WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Prompt not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});

export default router;
