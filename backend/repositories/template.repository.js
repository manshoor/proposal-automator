import pool from '../db/pool.js';

export async function findAll(userId = null) {
  // Explicit column list — callers (bootstrap, listTemplates) use id/name/content/platform/
  // created_at/updated_at only. variables + is_default excluded from list; available via findById.
  const cols = 'id, user_id, name, content, platform, created_at, updated_at';
  if (userId) {
    const { rows } = await pool.query(`SELECT ${cols} FROM templates WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows;
  } else {
    const { rows } = await pool.query(`SELECT ${cols} FROM templates ORDER BY created_at DESC`);
    return rows;
  }
}

export async function findById(id, userId = null) {
  // Full column list intentional — detail/edit path needs variables + is_default.
  if (userId) {
    const { rows } = await pool.query('SELECT * FROM templates WHERE id = $1 AND user_id = $2', [id, userId]);
    return rows[0] || null;
  } else {
    const { rows } = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
    return rows[0] || null;
  }
}

export async function create(data, userId = null) {
  const { name, content, variables, is_default } = data;

  const columns = ['name', 'content', 'variables', 'is_default'];
  const values = [name, content, variables, is_default ?? false];

  if (userId) {
    columns.push('user_id');
    values.push(userId);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO templates (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  return rows[0];
}

export async function update(id, data, userId = null) {
  const { name, content, variables, is_default } = data;

  const values = [name ?? null, content, variables, is_default ?? null, id];
  let whereClause = 'WHERE id = $5';

  if (userId) {
    values.push(userId);
    whereClause += ` AND user_id = $${values.length}`;
  }

  const { rows } = await pool.query(
    `UPDATE templates SET
      name = COALESCE($1, name),
      content = $2,
      variables = $3,
      is_default = COALESCE($4, is_default),
      updated_at = NOW()
     ${whereClause}
     RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function remove(id, userId = null) {
  if (userId) {
    const { rows } = await pool.query(
      'DELETE FROM templates WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return rows[0] || null;
  } else {
    const { rows } = await pool.query(
      'DELETE FROM templates WHERE id = $1 RETURNING id',
      [id]
    );
    return rows[0] || null;
  }
}
