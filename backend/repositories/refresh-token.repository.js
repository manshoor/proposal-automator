import pool from '../db/pool.js';

export async function create({ userId, tokenHash, expiresAt }) {
  const { rows } = await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, tokenHash, expiresAt]
  );
  return rows[0];
}

export async function findByHash(tokenHash) {
  const { rows } = await pool.query(
    `SELECT rt.*, u.email, u.full_name, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
    [tokenHash]
  );
  return rows[0] || null;
}

export async function deleteByUserId(userId) {
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

export async function deleteExpired() {
  const { rowCount } = await pool.query('DELETE FROM refresh_tokens WHERE expires_at <= NOW()');
  return rowCount;
}
