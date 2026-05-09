import pool from '../db/pool.js';

type Row = Record<string, unknown>;

export async function findActive(userId: string): Promise<Row[]> {
  const { rows } = await pool.query(
    `SELECT * FROM proposal_insights WHERE user_id = $1 AND is_active = true ORDER BY confidence DESC`,
    [userId]
  );
  return rows;
}

export async function findAll(userId: string): Promise<Row[]> {
  const { rows } = await pool.query(
    `SELECT * FROM proposal_insights WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

export interface InsightCreateInput {
  insight_text: string;
  confidence?: number;
  category?: string;
  sample_size?: number;
}

export async function create({ insight_text, confidence, category, sample_size }: InsightCreateInput, userId: string): Promise<Row> {
  const { rows } = await pool.query(
    `INSERT INTO proposal_insights (user_id, insight_text, confidence, category, sample_size)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, insight_text, confidence || 0.5, category || 'general', sample_size || 0]
  );
  return rows[0];
}

export async function update(id: number | string, data: { is_active?: boolean }, userId: string): Promise<Row | null> {
  const { rows } = await pool.query(
    `UPDATE proposal_insights SET
      is_active = COALESCE($1, is_active),
      updated_at = NOW()
     WHERE id = $2 AND user_id = $3 RETURNING *`,
    [data.is_active, id, userId]
  );
  return rows[0] || null;
}

export async function deactivateAll(userId: string): Promise<void> {
  await pool.query(
    `UPDATE proposal_insights SET is_active = false, updated_at = NOW() WHERE user_id = $1`,
    [userId]
  );
}

export async function getProposalsWithOutcomes(userId: string): Promise<Row[]> {
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

export interface OutcomeBuckets {
  winners: Row[];
  losers: Row[];
  totalWinners: number;
  totalLosers: number;
}

export async function getOutcomeBuckets(userId: string, perBucket: number = 15): Promise<OutcomeBuckets> {
  const winnerTypes = ['hired', 'interview'];
  const loserTypes = ['rejected', 'no_response'];

  const cols = `id, job_title, job_skills, proposal_text, proposal_length,
                hourly_rate, client_total_spent, decline_reason,
                job_budget_amount, response_type, created_at`;

  const [winnersRes, losersRes, countsRes] = await Promise.all([
    pool.query(
      `SELECT ${cols}
       FROM proposals
       WHERE user_id = $1 AND response_type = ANY($2::text[])
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, winnerTypes, perBucket]
    ),
    pool.query(
      `SELECT ${cols}
       FROM proposals
       WHERE user_id = $1 AND response_type = ANY($2::text[])
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, loserTypes, perBucket]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE response_type = ANY($2::text[])) AS total_winners,
         COUNT(*) FILTER (WHERE response_type = ANY($3::text[])) AS total_losers
       FROM proposals
       WHERE user_id = $1 AND response_type IS NOT NULL`,
      [userId, winnerTypes, loserTypes]
    ),
  ]);

  return {
    winners: winnersRes.rows,
    losers: losersRes.rows,
    totalWinners: parseInt(countsRes.rows[0]?.total_winners ?? 0, 10),
    totalLosers: parseInt(countsRes.rows[0]?.total_losers ?? 0, 10),
  };
}
