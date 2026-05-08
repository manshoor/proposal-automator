import pool from '../db/pool.js';

/**
 * Persist the scraped Connects balance for a user.
 *
 * @param {string} userId
 * @param {number} balance
 * @returns {Promise<void>}
 */
export async function setBalance(userId, balance) {
  await pool.query(
    `UPDATE users
     SET connects_balance = $1, connects_balance_updated_at = NOW()
     WHERE id = $2`,
    [balance, userId],
  );
}

/**
 * Read the stored Connects balance for a user.
 *
 * @param {string} userId
 * @returns {Promise<{ balance: number|null, lastUpdated: string|null }>}
 */
export async function getBalance(userId) {
  const { rows } = await pool.query(
    `SELECT connects_balance, connects_balance_updated_at
     FROM users
     WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return { balance: null, lastUpdated: null };
  return {
    balance: row.connects_balance ?? null,
    lastUpdated: row.connects_balance_updated_at
      ? row.connects_balance_updated_at.toISOString()
      : null,
  };
}

/**
 * Compute total connect_cost spent on proposals in the last 7 days.
 *
 * @param {string} userId
 * @returns {Promise<number>} integer, 0 when no data
 */
export async function getWeeklySpend(userId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(connect_cost), 0)::int AS weekly_spend
     FROM proposals
     WHERE user_id = $1
       AND created_at > NOW() - INTERVAL '7 days'
       AND connect_cost IS NOT NULL`,
    [userId],
  );
  return rows[0]?.weekly_spend ?? 0;
}

/**
 * Compose balance, lastUpdated, weeklySpend, and runwayWeeks into a single summary.
 *
 * @param {string} userId
 * @returns {Promise<{
 *   balance: number|null,
 *   lastUpdated: string|null,
 *   weeklySpend: number,
 *   runwayWeeks: number|null
 * }>}
 */
export async function getSummary(userId) {
  const [{ balance, lastUpdated }, weeklySpend] = await Promise.all([
    getBalance(userId),
    getWeeklySpend(userId),
  ]);

  const runwayWeeks =
    balance !== null && weeklySpend > 0
      ? Math.floor(balance / weeklySpend)
      : null;

  return { balance, lastUpdated, weeklySpend, runwayWeeks };
}
