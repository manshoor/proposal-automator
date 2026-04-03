import pool from '../db/pool.js';

export async function findAll(userId = null) {
  const { rows } = await pool.query('SELECT * FROM templates ORDER BY created_at DESC');
  return rows;
}

export async function findById(id, userId = null) {
  const { rows } = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function create(data, userId = null) {
  const { name, content, variables, is_default } = data;

  const { rows } = await pool.query(
    `INSERT INTO templates (name, content, variables, is_default)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, content, variables, is_default ?? false]
  );
  return rows[0];
}

export async function update(id, data, userId = null) {
  const { name, content, variables, is_default } = data;

  const { rows } = await pool.query(
    `UPDATE templates SET
      name = COALESCE($1, name),
      content = $2,
      variables = $3,
      is_default = COALESCE($4, is_default),
      updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [name ?? null, content, variables, is_default ?? null, id]
  );
  return rows[0] || null;
}

export async function remove(id, userId = null) {
  const { rows } = await pool.query(
    'DELETE FROM templates WHERE id = $1 RETURNING id',
    [id]
  );
  return rows[0] || null;
}
