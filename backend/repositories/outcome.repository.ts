import pool from '../db/pool.js';

type Row = Record<string, unknown>;

const VALID_EVENT_TYPES = new Set([
  'viewed', 'message_thread_opened', 'archived', 'hired', 'replied', 'interview',
]);
const VALID_SOURCES = new Set(['dom', 'scrape', 'manual']);

export interface OutcomeEventInput {
  proposalId: number;
  userId: string;
  eventType: string;
  source: string;
  occurredAt: Date | string;
  metadata?: Record<string, unknown>;
}

export async function create({ proposalId, userId, eventType, source, occurredAt, metadata }: OutcomeEventInput): Promise<Row | null> {
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

export interface JobIdentity {
  jobUrl?: string;
  jobTitle?: string;
}

export async function findProposalByJobIdentity(userId: string, { jobUrl, jobTitle }: JobIdentity): Promise<Row | null> {
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

export async function findByProposal(proposalId: number, userId: string): Promise<Row[]> {
  const { rows } = await pool.query(
    `SELECT id, event_type, source, occurred_at, metadata, created_at
     FROM proposal_outcomes
     WHERE proposal_id = $1 AND user_id = $2
     ORDER BY occurred_at ASC`,
    [proposalId, userId]
  );
  return rows;
}

export async function listOutcomeRowsForUser(userId: string, daysBack: number = 90): Promise<Row[]> {
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
