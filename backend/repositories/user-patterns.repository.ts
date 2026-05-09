import pool from '../db/pool.js';

type Row = Record<string, unknown>;

export interface PatternBucket {
  userId: string;
  dimension: string;
  key: string;
  sampleSize: number;
  winCount: number;
  viewCount: number;
}

export async function upsert({ userId, dimension, key, sampleSize, winCount, viewCount }: PatternBucket): Promise<Row | null> {
  const responseRate = sampleSize > 0 ? winCount / sampleSize : 0;
  const viewRate = sampleSize > 0 ? viewCount / sampleSize : 0;
  const { rows } = await pool.query(
    `INSERT INTO user_patterns (user_id, dimension, key, sample_size, win_count, view_count, response_rate, view_rate, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (user_id, dimension, key) DO UPDATE
       SET sample_size = EXCLUDED.sample_size,
           win_count = EXCLUDED.win_count,
           view_count = EXCLUDED.view_count,
           response_rate = EXCLUDED.response_rate,
           view_rate = EXCLUDED.view_rate,
           last_updated = NOW()
     RETURNING id, user_id, dimension, key, sample_size, win_count, view_count, response_rate, view_rate, last_updated`,
    [userId, dimension, key, sampleSize, winCount, viewCount, responseRate, viewRate]
  );
  return rows[0] || null;
}

export interface BucketWithoutUser {
  key: string;
  sampleSize: number;
  winCount: number;
  viewCount: number;
}

export async function replaceForDimension(userId: string, dimension: string, buckets: BucketWithoutUser[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM user_patterns WHERE user_id = $1 AND dimension = $2`,
      [userId, dimension]
    );
    for (const b of buckets) {
      const responseRate = b.sampleSize > 0 ? b.winCount / b.sampleSize : 0;
      const viewRate = b.sampleSize > 0 ? b.viewCount / b.sampleSize : 0;
      await client.query(
        `INSERT INTO user_patterns (user_id, dimension, key, sample_size, win_count, view_count, response_rate, view_rate, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [userId, dimension, b.key, b.sampleSize, b.winCount, b.viewCount, responseRate, viewRate]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function findForUser(userId: string, dimension: string | null = null): Promise<Row[]> {
  if (dimension) {
    const { rows } = await pool.query(
      `SELECT id, dimension, key, sample_size, win_count, view_count, response_rate, view_rate, last_updated
       FROM user_patterns
       WHERE user_id = $1 AND dimension = $2
       ORDER BY response_rate DESC, sample_size DESC`,
      [userId, dimension]
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT id, dimension, key, sample_size, win_count, view_count, response_rate, view_rate, last_updated
     FROM user_patterns
     WHERE user_id = $1
     ORDER BY dimension, response_rate DESC`,
    [userId]
  );
  return rows;
}

export async function findTopKey(userId: string, dimension: string, minSampleSize: number = 5): Promise<Row | null> {
  const { rows } = await pool.query(
    `SELECT key, sample_size, response_rate, view_rate
     FROM user_patterns
     WHERE user_id = $1 AND dimension = $2 AND sample_size >= $3
     ORDER BY response_rate DESC, view_rate DESC, sample_size DESC
     LIMIT 1`,
    [userId, dimension, minSampleSize]
  );
  return rows[0] || null;
}

export async function hasContextCoverage(userId: string, contextDim: string, contextKey: string, minSampleSize: number = 5): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT sample_size
     FROM user_patterns
     WHERE user_id = $1 AND dimension = $2 AND key = $3`,
    [userId, contextDim, contextKey]
  );
  return rows[0] ? Number(rows[0].sample_size) >= minSampleSize : false;
}

export async function fetchRawProposalSignals(userId: string, daysBack: number = 90): Promise<Row[]> {
  const { rows } = await pool.query(
    `SELECT
       p.id AS proposal_id,
       p.hook_style,
       p.client_total_spent,
       p.client_hire_rate,
       p.client_review_count,
       p.client_location,
       p.job_skills,
       BOOL_OR(po.event_type IN ('replied','interview','hired')) AS has_win,
       BOOL_OR(po.event_type IN ('viewed','message_thread_opened','replied','interview','hired')) AS has_view
     FROM proposals p
     LEFT JOIN proposal_outcomes po
       ON po.proposal_id = p.id AND po.user_id = $1
     WHERE p.user_id = $1
       AND p.hook_style IS NOT NULL
       AND p.created_at > NOW() - ($2 || ' days')::interval
     GROUP BY p.id`,
    [userId, String(daysBack)]
  );
  return rows;
}
