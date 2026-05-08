import pool from '../db/pool.js';

const ALLOWED_SORT_COLUMNS = new Set(['created_at', 'updated_at', 'job_title', 'status', 'hourly_rate']);
const ALLOWED_STATUSES = new Set(['sent', 'pending', 'hired', 'rejected', 'withdrawn']);

export async function findAll({ status, limit = 20, offset = 0, sort = 'created_at', order = 'desc' } = {}, userId = null) {
  const safeSort = ALLOWED_SORT_COLUMNS.has(sort) ? sort : 'created_at';
  const safeOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const params = [];
  const conditions = [];

  if (status && ALLOWED_STATUSES.has(status)) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  if (userId) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }

  let whereClause = '';
  if (conditions.length > 0) whereClause = 'WHERE ' + conditions.join(' AND ');

  params.push(safeLimit, safeOffset);

  const query = `
    SELECT id, job_title, job_url, status, response_type, hourly_rate,
           client_location, client_total_spent, client_hire_rate, client_review_count,
           job_budget_type, job_budget_amount, job_budget_min, job_budget_max,
           connect_cost, earnings, proposal_count, proposal_length, template_used,
           responded_at, decline_reason, payment_verified, loom_url,
           created_at, updated_at
    FROM proposals
    ${whereClause}
    ORDER BY ${safeSort} ${safeOrder}
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const { rows } = await pool.query(query, params);
  return rows;
}

export async function findById(id, userId = null) {
  if (userId) {
    const { rows } = await pool.query('SELECT * FROM proposals WHERE id = $1 AND user_id = $2', [id, userId]);
    return rows[0] || null;
  } else {
    const { rows } = await pool.query('SELECT * FROM proposals WHERE id = $1', [id]);
    return rows[0] || null;
  }
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
    hook_style,
    payment_verified,
    loom_url,
  } = data;

  const columns = [
    'job_url', 'job_title', 'job_description',
    'job_budget_type', 'job_budget_min', 'job_budget_max', 'job_budget_amount',
    'job_skills', 'client_location', 'client_total_spent', 'client_hire_rate',
    'client_review_count', 'proposal_text', 'hourly_rate',
    'hidden_instructions', 'vetting_result', 'proposal_count', 'connect_cost',
    'hook_style', 'payment_verified', 'loom_url',
  ];
  const values = [
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
    hook_style ?? null,
    payment_verified ?? null,
    loom_url ?? null,
  ];

  if (userId) {
    columns.push('user_id');
    values.push(userId);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO proposals (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    values
  );
  return rows[0] || null;
}

export async function update(id, data, userId = null) {
  const { status, earnings, response_type, responded_at, decline_reason, client_feedback, loom_url } = data;

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

  if (response_type !== undefined) {
    sets.push(`response_type = $${idx++}`);
    values.push(response_type);
  }

  if (responded_at !== undefined) {
    sets.push(`responded_at = $${idx++}`);
    values.push(responded_at);
  }

  if (decline_reason !== undefined) {
    sets.push(`decline_reason = $${idx++}`);
    values.push(decline_reason);
  }

  if (client_feedback !== undefined) {
    sets.push(`client_feedback = $${idx++}`);
    values.push(client_feedback);
  }

  if (loom_url !== undefined) {
    sets.push(`loom_url = $${idx++}`);
    values.push(loom_url);
  }

  if (sets.length === 0) {
    return null;
  }

  sets.push('updated_at = NOW()');
  values.push(id);
  let whereClause = `WHERE id = $${idx++}`;

  if (userId) {
    values.push(userId);
    whereClause += ` AND user_id = $${idx++}`;
  }

  const { rows } = await pool.query(
    `UPDATE proposals SET ${sets.join(', ')} ${whereClause} RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function findRecentUrls(userId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT job_url FROM proposals WHERE user_id = $1 AND status = 'sent' ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows.map(r => r.job_url).filter(Boolean);
}

export async function remove(id, userId = null) {
  if (userId) {
    const { rowCount } = await pool.query('DELETE FROM proposals WHERE id = $1 AND user_id = $2', [id, userId]);
    return rowCount > 0;
  }
  const { rowCount } = await pool.query('DELETE FROM proposals WHERE id = $1', [id]);
  return rowCount > 0;
}
