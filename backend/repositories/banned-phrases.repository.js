import pool from '../db/pool.js';

/**
 * Returns all active banned phrases applicable to the given user.
 * Includes system phrases, admin global phrases, and the user's own phrases.
 *
 * @param {string|null} userId
 * @returns {Promise<Array<{id, scope, user_id, phrase, severity, active}>>}
 */
export async function findActiveForUser(userId) {
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

/**
 * Lists phrases visible to the user (their own + admin/system view-only).
 */
export async function findVisible(userId) {
  const { rows } = await pool.query(
    `SELECT id, scope, user_id, phrase, severity, active, created_at
     FROM banned_phrases
     WHERE scope IN ('system', 'admin') OR (scope = 'user' AND user_id = $1)
     ORDER BY scope, phrase`,
    [userId]
  );
  return rows;
}

export async function create({ scope, userId, phrase, severity }) {
  const { rows } = await pool.query(
    `INSERT INTO banned_phrases (scope, user_id, phrase, severity)
     VALUES ($1, $2, $3, $4)
     RETURNING id, scope, user_id, phrase, severity, active, created_at`,
    [scope, userId, phrase, severity]
  );
  return rows[0] || null;
}

/**
 * Removes a phrase. Admins can delete admin- or user-scoped rows; users only their own.
 * System phrases are never deletable through the API.
 */
export async function remove(id, userId, isAdmin = false) {
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
  return result.rowCount > 0;
}
