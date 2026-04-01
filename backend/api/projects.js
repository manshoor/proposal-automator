import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// GET /api/projects — list all projects
router.get('/', async (req, res) => {
  try {
    const { category, featured } = req.query;
    let query = 'SELECT * FROM projects';
    const conditions = [];
    const values = [];

    if (category) {
      values.push(category);
      conditions.push(`category = $${values.length}`);
    }
    if (featured === 'true') {
      conditions.push('is_featured = true');
    }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY is_featured DESC, created_at DESC';

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/projects error:', err.message);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// POST /api/projects — create
router.post('/', async (req, res) => {
  const { name, description, url, technologies, category, client_name, budget_range, duration, outcome, is_featured } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO projects (name, description, url, technologies, category, client_name, budget_range, duration, outcome, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [name, description || '', url || null, technologies || [], category || '', client_name || '', budget_range || '', duration || '', outcome || '', is_featured || false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/projects error:', err.message);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id — update
router.put('/:id', async (req, res) => {
  const { name, description, url, technologies, category, client_name, budget_range, duration, outcome, is_featured, screenshots } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE projects SET
        name = COALESCE($1, name), description = COALESCE($2, description),
        url = $3, technologies = COALESCE($4, technologies),
        category = COALESCE($5, category), client_name = COALESCE($6, client_name),
        budget_range = COALESCE($7, budget_range), duration = COALESCE($8, duration),
        outcome = COALESCE($9, outcome), is_featured = COALESCE($10, is_featured),
        screenshots = COALESCE($12, screenshots),
        updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [name, description, url || null, technologies, category, client_name, budget_range, duration, outcome, is_featured, req.params.id, screenshots || null]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/projects error:', err.message);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
