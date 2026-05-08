import pool from '../db/pool.js';

const VALID_EVENT_TYPES = new Set([
  'viewed', 'message_thread_opened', 'archived', 'hired', 'replied', 'interview',
]);
const VALID_SOURCES = new Set(['dom', 'scrape', 'manual']);

/**
 * Insert one outcome event row.
 *
 * @param {object} args
 * @param {number} args.proposalId
 * @param {string} args.userId
 * @param {string} args.eventType
 * @param {string} args.source
 * @param {Date|string} args.occurredAt
 * @param {object} [args.metadata]
 */
export async function create({ proposalId, userId, eventType, source, occurredAt, metadata }) {
  if (!VALID_EVENT_TYPES.has(eventType)) throw new Error(`Invalid event_type: ${eventType}`);
  if (!VALID_SOURCES.has(source)) throw new Error(`Invalid source: ${source}`);
  const { rows } = await pool.query(
    `INSERT INTO proposal_outcomes (proposal_id, user_id, event_type, source, occurred_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, proposal_id, event_type, source, occurred_at, metadata, created_at`,
    [
      proposalId,
      userId,
      eventType,
      source,
      occurredAt instanceof Date ? occurredAt.toISOString() : occurredAt,
      metadata ? JSON.stringify(metadata) : '{}',
    ]
  );
  return rows[0] || null;
}

/**
 * Find a proposal owned by user that matches a job URL or job title (best-effort match).
 * Used by the ingest service when the extension sends events without a proposal_id.
 *
 * @returns {Promise<{id, hook_style, job_url, job_title, created_at}|null>}
 */
export async function findProposalByJobIdentity(userId, { jobUrl, jobTitle }) {
  if (jobUrl) {
    const { rows } = await pool.query(
      `SELECT id, hook_style, job_url, job_title, created_at
       FROM proposals
       WHERE user_id = $1 AND job_url = $2
       ORDER BY created_at DESC LIMIT 1`,
      [userId, jobUrl]
    );
    if (rows[0]) return rows[0];
  }
  if (jobTitle) {
    const { rows } = await pool.query(
      `SELECT id, hook_style, job_url, job_title, created_at
       FROM proposals
       WHERE user_id = $1 AND LOWER(job_title) = LOWER($2)
         AND created_at > NOW() - INTERVAL '60 days'
       ORDER BY created_at DESC LIMIT 1`,
      [userId, jobTitle]
    );
    if (rows[0]) return rows[0];
  }
  return null;
}

/**
 * List events for a single proposal (oldest first).
 */
export async function findByProposal(proposalId, userId) {
  const { rows } = await pool.query(
    `SELECT id, event_type, source, occurred_at, metadata, created_at
     FROM proposal_outcomes
     WHERE proposal_id = $1 AND user_id = $2
     ORDER BY occurred_at ASC`,
    [proposalId, userId]
  );
  return rows;
}

/**
 * For aggregation: list every proposal in the last N days plus its event types and the
 * client signals needed for persona classification.
 */
export async function listOutcomeRowsForUser(userId, daysBack = 90) {
  const { rows } = await pool.query(
    `SELECT
       p.id AS proposal_id,
       p.hook_style,
       p.job_skills,
       p.client_total_spent,
       p.client_hire_rate,
       p.client_review_count,
       p.client_location,
       p.created_at,
       COALESCE(json_agg(DISTINCT po.event_type) FILTER (WHERE po.event_type IS NOT NULL), '[]'::json) AS event_types
     FROM proposals p
     LEFT JOIN proposal_outcomes po
       ON po.proposal_id = p.id AND po.user_id = $1
     WHERE p.user_id = $1
       AND p.created_at > NOW() - ($2 || ' days')::interval
     GROUP BY p.id`,
    [userId, String(daysBack)]
  );
  return rows;
}
