import pool from '../db/pool.js';

export async function findAll({ category, featured } = {}, userId = null) {
  let query = 'SELECT * FROM projects';
  const conditions = [];
  const values = [];

  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }
  if (featured === 'true' || featured === true) {
    conditions.push('is_featured = true');
  }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY is_featured DESC, created_at DESC';

  const { rows } = await pool.query(query, values);
  return rows;
}

export async function findById(id, userId = null) {
  const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function create(data, userId = null) {
  const { name, description, url, technologies, category, client_name, budget_range, duration, outcome, is_featured } = data;

  const { rows } = await pool.query(
    `INSERT INTO projects (name, description, url, technologies, category, client_name, budget_range, duration, outcome, is_featured)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [name, description || '', url || null, technologies || [], category || '', client_name || '', budget_range || '', duration || '', outcome || '', is_featured || false]
  );
  return rows[0];
}

export async function update(id, data, userId = null) {
  const { name, description, url, technologies, category, client_name, budget_range, duration, outcome, is_featured, screenshots } = data;

  const { rows } = await pool.query(
    `UPDATE projects SET
      name = COALESCE($1, name), description = COALESCE($2, description),
      url = $3, technologies = COALESCE($4, technologies),
      category = COALESCE($5, category), client_name = COALESCE($6, client_name),
      budget_range = COALESCE($7, budget_range), duration = COALESCE($8, duration),
      outcome = COALESCE($9, outcome), is_featured = COALESCE($10, is_featured),
      screenshots = COALESCE($12, screenshots),
      updated_at = NOW()
     WHERE id = $11 RETURNING *`,
    [name, description, url || null, technologies, category, client_name, budget_range, duration, outcome, is_featured, id, screenshots || null]
  );
  return rows[0] || null;
}

export async function remove(id, userId = null) {
  const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1', [id]);
  return rowCount > 0;
}
