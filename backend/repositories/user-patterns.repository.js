import pool from '../db/pool.js';

/**
 * Upsert one pattern bucket.
 */
export async function upsert({ userId, dimension, key, sampleSize, winCount, viewCount }) {
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

/**
 * Replace ALL patterns for a (user_id, dimension) atomically. Used when re-aggregating.
 */
export async function replaceForDimension(userId, dimension, buckets) {
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

export async function findForUser(userId, dimension = null) {
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

/**
 * Find the best-performing key for a given user+dimension with confident sample size.
 * Returns null if no bucket meets the minimum sample size.
 */
export async function findTopKey(userId, dimension, minSampleSize = 5) {
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
