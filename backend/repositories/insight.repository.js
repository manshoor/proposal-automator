import pool from '../db/pool.js';

export async function findActive(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM proposal_insights WHERE user_id = $1 AND is_active = true ORDER BY confidence DESC`,
    [userId]
  );
  return rows;
}

export async function findAll(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM proposal_insights WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

export async function create({ insight_text, confidence, category, sample_size }, userId) {
  const { rows } = await pool.query(
    `INSERT INTO proposal_insights (user_id, insight_text, confidence, category, sample_size)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, insight_text, confidence || 0.5, category || 'general', sample_size || 0]
  );
  return rows[0];
}

export async function update(id, data, userId) {
  const { rows } = await pool.query(
    `UPDATE proposal_insights SET
      is_active = COALESCE($1, is_active),
      updated_at = NOW()
     WHERE id = $2 AND user_id = $3 RETURNING *`,
    [data.is_active, id, userId]
  );
  return rows[0] || null;
}

export async function deactivateAll(userId) {
  await pool.query(
    `UPDATE proposal_insights SET is_active = false, updated_at = NOW() WHERE user_id = $1`,
    [userId]
  );
}

export async function getProposalsWithOutcomes(userId) {
  const { rows } = await pool.query(
    `SELECT id, job_title, job_description, job_skills, proposal_text, proposal_length,
            status, response_type, decline_reason, client_feedback, template_used,
            hourly_rate, client_location, client_total_spent, client_hire_rate,
            job_budget_type, job_budget_amount, created_at
     FROM proposals
     WHERE user_id = $1 AND response_type IS NOT NULL
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}
