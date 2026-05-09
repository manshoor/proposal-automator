import pool from '../db/pool.js';

type Row = Record<string, unknown>;

const ALLOWED_STATUSES = new Set(['scheduled', 'sent', 'cancelled', 'expired']);

export interface FollowUpCreateInput {
  proposal_id: number;
  user_id: string;
  scheduled_at: string;
  message_text: string;
  sequence_index?: number;
  metadata?: Record<string, unknown>;
}

export async function create(data: FollowUpCreateInput): Promise<Row | null> {
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

export async function findById(id: number | string, userId: string): Promise<Row | null> {
  const { rows } = await pool.query(
    `SELECT * FROM proposal_followups WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

export interface FollowUpListOptions {
  status?: string;
  limit?: number | string;
  offset?: number | string;
}

export async function findByUser(userId: string, { status, limit = 20, offset = 0 }: FollowUpListOptions = {}): Promise<Row[]> {
  const safeLimit = Math.min(Math.max(parseInt(String(limit), 10) || 20, 1), 100);
  const safeOffset = Math.max(parseInt(String(offset), 10) || 0, 0);

  const params: unknown[] = [userId];
  const conditions: string[] = ['user_id = $1'];

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

export interface FollowUpUpdateData {
  scheduled_at?: string;
  sent_at?: string;
  message_text?: string;
  status?: string;
}

export async function update(id: number | string, userId: string, data: FollowUpUpdateData): Promise<Row | null> {
  const { scheduled_at, sent_at, message_text, status } = data;

  const sets: string[] = [];
  const values: unknown[] = [];
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

export async function cancel(id: number | string, userId: string): Promise<Row | null> {
  const { rows } = await pool.query(
    `UPDATE proposal_followups
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'scheduled'
     RETURNING *`,
    [id, userId]
  );
  return rows[0] || null;
}

export async function listDueNow(): Promise<Row[]> {
  const { rows } = await pool.query(
    `SELECT * FROM proposal_followups
     WHERE status = 'scheduled' AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC`
  );
  return rows;
}

export async function setSequenceIndex(id: number | string, sequenceIndex: number): Promise<Row | null> {
  const { rows } = await pool.query(
    `UPDATE proposal_followups
     SET sequence_index = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [sequenceIndex, id]
  );
  return rows[0] || null;
}

export async function findProposalForUser(proposalId: number, userId: string): Promise<Row | null> {
  const { rows } = await pool.query(
    `SELECT id, job_title, proposal_text, created_at
     FROM proposals
     WHERE id = $1 AND user_id = $2`,
    [proposalId, userId]
  );
  return rows[0] || null;
}
