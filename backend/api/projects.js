import { Router } from 'express';
import pool from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { ValidationError, NotFoundError, ExternalServiceError } from '../lib/errors.js';

const router = Router();

// GET /api/projects — list all projects
router.get('/', asyncHandler(async (req, res) => {
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
}));

// GET /api/projects/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  if (rows.length === 0) throw new NotFoundError('Project');
  res.json(rows[0]);
}));

// POST /api/projects — create
router.post('/', asyncHandler(async (req, res) => {
  const { name, description, url, technologies, category, client_name, budget_range, duration, outcome, is_featured } = req.body;
  if (!name) throw new ValidationError('name is required');

  const { rows } = await pool.query(
    `INSERT INTO projects (name, description, url, technologies, category, client_name, budget_range, duration, outcome, is_featured)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [name, description || '', url || null, technologies || [], category || '', client_name || '', budget_range || '', duration || '', outcome || '', is_featured || false]
  );
  res.status(201).json(rows[0]);
}));

// PUT /api/projects/:id — update
router.put('/:id', asyncHandler(async (req, res) => {
  const { name, description, url, technologies, category, client_name, budget_range, duration, outcome, is_featured, screenshots } = req.body;

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
  if (rows.length === 0) throw new NotFoundError('Project');
  res.json(rows[0]);
}));

// DELETE /api/projects/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
  if (rowCount === 0) throw new NotFoundError('Project');
  res.json({ success: true });
}));

export default router;
