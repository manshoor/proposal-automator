import pool from '../db/pool.js';

const ALLOWED_SORT_COLUMNS = new Set(['created_at', 'updated_at', 'job_title', 'status', 'hourly_rate']);
const ALLOWED_STATUSES = new Set(['sent', 'pending', 'hired', 'rejected', 'withdrawn']);

export async function findAll({ status, limit = 20, offset = 0, sort = 'created_at', order = 'desc' } = {}, userId = null) {
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
  return rows;
}

export async function findById(id, userId = null) {
  const { rows } = await pool.query('SELECT * FROM proposals WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function create(data, userId = null) {
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
    hidden_instructions,
    vetting_result,
    proposal_count,
    connect_cost,
  } = data;

  const { rows } = await pool.query(
    `INSERT INTO proposals (
      job_url, job_title, job_description,
      job_budget_type, job_budget_min, job_budget_max, job_budget_amount,
      job_skills, client_location, client_total_spent, client_hire_rate,
      client_review_count, proposal_text, hourly_rate,
      hidden_instructions, vetting_result, proposal_count, connect_cost
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
    ) RETURNING id`,
    [
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
      hidden_instructions,
      vetting_result,
      proposal_count,
      connect_cost,
    ]
  );
  return rows[0] || null;
}

export async function update(id, data, userId = null) {
  const { status, earnings } = data;

  const sets = [];
  const values = [];
  let idx = 1;

  if (status !== undefined && status !== null) {
    sets.push(`status = $${idx++}`);
    values.push(status);
  }

  if (earnings !== undefined && earnings !== null) {
    sets.push(`earnings = $${idx++}`);
    values.push(earnings);
  }

  if (sets.length === 0) {
    return null;
  }

  sets.push('updated_at = NOW()');
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE proposals SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0] || null;
}
