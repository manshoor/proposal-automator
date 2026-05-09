import pool from '../db/pool.js';

type Row = Record<string, unknown>;

export async function findActiveForUser(userId: string | null): Promise<Row[]> {
  const { rows } = await pool.query(
    `SELECT id, scope, user_id, phrase, severity, active
     FROM banned_phrases
     WHERE active = TRUE AND (
       scope = 'system'
       OR scope = 'admin'
       OR (scope = 'user' AND user_id = $1)
     )`,
    [userId]
  );
  return rows;
}

export async function findVisible(userId: string | null): Promise<Row[]> {
  const { rows } = await pool.query(
    `SELECT id, scope, user_id, phrase, severity, active, created_at
     FROM banned_phrases
     WHERE scope IN ('system', 'admin') OR (scope = 'user' AND user_id = $1)
     ORDER BY scope, phrase`,
    [userId]
  );
  return rows;
}

export interface BannedPhraseCreateInput {
  scope: string;
  userId: string | null;
  phrase: string;
  severity: string;
}

export async function create({ scope, userId, phrase, severity }: BannedPhraseCreateInput): Promise<Row | null> {
  const { rows } = await pool.query(
    `INSERT INTO banned_phrases (scope, user_id, phrase, severity)
     VALUES ($1, $2, $3, $4)
     RETURNING id, scope, user_id, phrase, severity, active, created_at`,
    [scope, userId, phrase, severity]
  );
  return rows[0] || null;
}

export async function remove(id: number | string, userId: string | null, isAdmin = false): Promise<boolean> {
  let result;
  if (isAdmin) {
    result = await pool.query(
      `DELETE FROM banned_phrases
       WHERE id = $1 AND scope IN ('admin', 'user')
       RETURNING id`,
      [id]
    );
  } else {
    result = await pool.query(
      `DELETE FROM banned_phrases
       WHERE id = $1 AND scope = 'user' AND user_id = $2
       RETURNING id`,
      [id, userId]
    );
  }
  return (result.rowCount ?? 0) > 0;
}
