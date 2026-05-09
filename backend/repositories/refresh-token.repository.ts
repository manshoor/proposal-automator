import pool from '../db/pool.js';

export async function create({ userId, tokenHash, expiresAt }: { userId: string; tokenHash: string; expiresAt: Date | string }): Promise<Record<string, unknown>> {
  const { rows } = await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, tokenHash, expiresAt]
  );
  return rows[0];
}

export async function findByHash(tokenHash: string): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(
    `SELECT rt.*, u.email, u.full_name, u.is_active, u.role
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
    [tokenHash]
  );
  return rows[0] || null;
}

export async function deleteByUserId(userId: string): Promise<void> {
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

export async function deleteByHash(tokenHash: string): Promise<number> {
  const { rowCount } = await pool.query(
    'DELETE FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash]
  );
  return rowCount ?? 0;
}

export async function deleteExpired(): Promise<number> {
  const { rowCount } = await pool.query('DELETE FROM refresh_tokens WHERE expires_at <= NOW()');
  return rowCount ?? 0;
}
