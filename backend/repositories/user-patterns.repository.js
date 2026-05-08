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

/**
 * Check whether a given context key has at least minSampleSize outcomes in the
 * user's pre-aggregated patterns for that dimension. Used by the service layer
 * to gate context-specific lookups before doing the more expensive raw-row pass.
 *
 * @param {string} userId
 * @param {string} contextDim   - 'persona' | 'niche'
 * @param {string} contextKey   - e.g. 'enterprise-us-high-spend'
 * @param {number} minSampleSize
 * @returns {Promise<boolean>}
 */
export async function hasContextCoverage(userId, contextDim, contextKey, minSampleSize = 5) {
  const { rows } = await pool.query(
    `SELECT sample_size
     FROM user_patterns
     WHERE user_id = $1 AND dimension = $2 AND key = $3`,
    [userId, contextDim, contextKey]
  );
  return rows[0] ? rows[0].sample_size >= minSampleSize : false;
}

/**
 * Fetch raw proposal + outcome signal rows for a user, suitable for per-row
 * classification by the service layer (persona / niche cannot be pre-filtered in SQL
 * because they are computed from client signals, not stored columns).
 *
 * Returns every proposal in the last `daysBack` days that has a non-null hook_style,
 * along with the client signals needed for persona/niche classification and the
 * aggregate win/view event flags per proposal.
 *
 * Scalability note: performs a full scan of proposals + proposal_outcomes for the user.
 * Acceptable up to ~500–1000 proposal rows per user. Once volume exceeds that, replace
 * with a pre-aggregated joint table (user_id, hook_style, context_dim, context_key).
 *
 * @param {string} userId
 * @param {number} daysBack
 * @returns {Promise<Array<{
 *   proposal_id, hook_style,
 *   client_total_spent, client_hire_rate, client_review_count, client_location,
 *   job_skills,
 *   has_win: boolean, has_view: boolean
 * }>>}
 */
export async function fetchRawProposalSignals(userId, daysBack = 90) {
  const { rows } = await pool.query(
    `SELECT
       p.id AS proposal_id,
       p.hook_style,
       p.client_total_spent,
       p.client_hire_rate,
       p.client_review_count,
       p.client_location,
       p.job_skills,
       -- pre-aggregate win/view flags so the service doesn't need to join further
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
