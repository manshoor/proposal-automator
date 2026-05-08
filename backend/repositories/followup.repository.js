import pool from '../db/pool.js';

const ALLOWED_SORT_COLUMNS = new Set(['created_at', 'updated_at', 'scheduled_at']);
const ALLOWED_STATUSES = new Set(['scheduled', 'sent', 'cancelled', 'expired']);

/**
 * Create a new follow-up row.
 *
 * @param {object} data
 * @param {number} data.proposal_id
 * @param {string} data.user_id
 * @param {string} data.scheduled_at  ISO timestamp
 * @param {string} data.message_text
 * @param {number} [data.sequence_index]
 * @param {object} [data.metadata]
 * @returns {Promise<object>}
 */
export async function create(data) {
  const {
    proposal_id,
    user_id,
    scheduled_at,
    message_text,
    sequence_index = 0,
    metadata = {},
  } = data;

  const { rows } = await pool.query(
    `INSERT INTO proposal_followups
       (proposal_id, user_id, scheduled_at, message_text, sequence_index, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [proposal_id, user_id, scheduled_at, message_text, sequence_index, JSON.stringify(metadata)]
  );
  return rows[0] || null;
}

/**
 * Find a single follow-up by id scoped to the given user.
 *
 * @param {number} id
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function findById(id, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM proposal_followups WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

/**
 * List follow-ups for a user with optional status filter and pagination.
 *
 * @param {string} userId
 * @param {object} options
 * @param {string} [options.status]
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 * @returns {Promise<object[]>}
 */
export async function findByUser(userId, { status, limit = 20, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const params = [userId];
  const conditions = ['user_id = $1'];

  if (status && ALLOWED_STATUSES.has(status)) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  params.push(safeLimit, safeOffset);

  const { rows } = await pool.query(
    `SELECT * FROM proposal_followups
     WHERE ${conditions.join(' AND ')}
     ORDER BY scheduled_at ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

/**
 * Partially update a follow-up. Only whitelisted fields are touched.
 *
 * @param {number} id
 * @param {string} userId
 * @param {object} data
 * @param {string} [data.scheduled_at]
 * @param {string} [data.sent_at]
 * @param {string} [data.message_text]
 * @param {string} [data.status]
 * @returns {Promise<object|null>}
 */
export async function update(id, userId, data) {
  const { scheduled_at, sent_at, message_text, status } = data;

  const sets = [];
  const values = [];
  let idx = 1;

  if (scheduled_at !== undefined) {
    sets.push(`scheduled_at = $${idx++}`);
    values.push(scheduled_at);
  }
  if (sent_at !== undefined) {
    sets.push(`sent_at = $${idx++}`);
    values.push(sent_at);
  }
  if (message_text !== undefined) {
    sets.push(`message_text = $${idx++}`);
    values.push(message_text);
  }
  if (status !== undefined) {
    sets.push(`status = $${idx++}`);
    values.push(status);
  }

  if (sets.length === 0) {
    return null;
  }

  sets.push('updated_at = NOW()');

  values.push(id, userId);
  const whereClause = `WHERE id = $${idx++} AND user_id = $${idx++}`;

  const { rows } = await pool.query(
    `UPDATE proposal_followups SET ${sets.join(', ')} ${whereClause} RETURNING *`,
    values
  );
  return rows[0] || null;
}

/**
 * Set status = 'cancelled' for the given follow-up.
 *
 * @param {number} id
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function cancel(id, userId) {
  const { rows } = await pool.query(
    `UPDATE proposal_followups
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'scheduled'
     RETURNING *`,
    [id, userId]
  );
  return rows[0] || null;
}

/**
 * Return all follow-ups with status='scheduled' whose scheduled_at is in the past.
 * Used by the background worker (not yet wired up).
 *
 * @returns {Promise<object[]>}
 */
export async function listDueNow() {
  const { rows } = await pool.query(
    `SELECT * FROM proposal_followups
     WHERE status = 'scheduled' AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC`
  );
  return rows;
}

/**
 * Set the sequence_index on a specific follow-up row.
 * Used after bulk-creating sequence rows so the index is applied without
 * going through the full update whitelist.
 *
 * @param {number} id
 * @param {number} sequenceIndex
 * @returns {Promise<object|null>}
 */
export async function setSequenceIndex(id, sequenceIndex) {
  const { rows } = await pool.query(
    `UPDATE proposal_followups
     SET sequence_index = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [sequenceIndex, id]
  );
  return rows[0] || null;
}

/**
 * Fetch the proposal row belonging to userId for proposal ownership checks.
 *
 * @param {number} proposalId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function findProposalForUser(proposalId, userId) {
  const { rows } = await pool.query(
    `SELECT id, job_title, proposal_text, created_at
     FROM proposals
     WHERE id = $1 AND user_id = $2`,
    [proposalId, userId]
  );
  return rows[0] || null;
}
