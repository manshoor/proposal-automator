import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const ALLOWED_SORT_COLUMNS = new Set(['created_at', 'updated_at', 'job_title', 'status', 'hourly_rate']);
const ALLOWED_STATUSES = new Set(['sent', 'pending', 'hired', 'rejected', 'withdrawn']);

router.get('/', async (req, res) => {
  try {
    const {
      status,
      limit = '20',
      offset = '0',
      sort = 'created_at',
      order = 'desc',
    } = req.query;

    const safeSort = ALLOWED_SORT_COLUMNS.has(sort) ? sort : 'created_at';
    const safeOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const params = [];
    let whereClause = '';

    if (status && ALLOWED_STATUSES.has(status)) {
      params.push(status);
      whereClause = `WHERE status = $${params.length}`;
    }

    params.push(safeLimit, safeOffset);

    const query = `
      SELECT * FROM proposals
      ${whereClause}
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const { rows } = await pool.query(query, params);
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/proposals error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM proposals WHERE id = $1', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/proposals/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

router.post('/', async (req, res) => {
  const {
    job_url,
    job_title,
    job_description,
    job_budget_type,
    job_budget_min,
    job_budget_max,
    job_budget_amount,
    job_skills,
    client_location,
    client_total_spent,
    client_hire_rate,
    client_review_count,
    proposal_text,
    hourly_rate,
    status,
    hidden_instructions,
    vetting_result,
    proposal_count,
  } = req.body;

  if (!job_url || !job_title || !proposal_text) {
    return res.status(400).json({ error: 'job_url, job_title, and proposal_text are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO proposals (
        job_url, job_title, job_description,
        job_budget_type, job_budget_min, job_budget_max, job_budget_amount,
        job_skills, client_location, client_total_spent, client_hire_rate,
        client_review_count, proposal_text, hourly_rate, status,
        hidden_instructions, vetting_result, proposal_count
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      ) RETURNING *`,
      [
        job_url,
        job_title,
        job_description || null,
        job_budget_type || null,
        job_budget_min || null,
        job_budget_max || null,
        job_budget_amount || null,
        job_skills || [],
        client_location || null,
        client_total_spent || null,
        client_hire_rate || null,
        client_review_count || null,
        proposal_text,
        hourly_rate || null,
        status || 'sent',
        hidden_instructions || null,
        vetting_result ? JSON.stringify(vetting_result) : null,
        proposal_count || null,
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/proposals error:', err.message);
    return res.status(500).json({ error: 'Failed to create proposal' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, earnings } = req.body;

  // Build dynamic SET clause
  const sets = [];
  const values = [];
  let idx = 1;

  if (status) {
    if (!ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: `status must be one of: ${[...ALLOWED_STATUSES].join(', ')}` });
    }
    sets.push(`status = $${idx++}`);
    values.push(status);
  }

  if (earnings !== undefined && earnings !== null) {
    const amt = parseFloat(earnings);
    if (isNaN(amt) || amt < 0) {
      return res.status(400).json({ error: 'earnings must be a positive number' });
    }
    sets.push(`earnings = $${idx++}`);
    values.push(amt);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to update. Send status or earnings.' });
  }

  sets.push('updated_at = NOW()');
  values.push(id);

  try {
    const { rows } = await pool.query(
      `UPDATE proposals SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/proposals/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to update proposal' });
  }
});

export default router;
