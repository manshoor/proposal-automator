import pool from '../db/pool.js';

export async function findAll({ platform, active } = {}, userId = null) {
  let query = 'SELECT * FROM prompts';
  const conditions = [];
  const values = [];

  if (platform) {
    values.push(platform);
    conditions.push(`(platform = $${values.length} OR platform = 'all')`);
  }
  if (active === 'true' || active === true) {
    conditions.push('is_active = true');
  }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY is_default DESC, platform ASC, created_at DESC';

  const { rows } = await pool.query(query, values);
  return rows;
}

export async function findActiveForPlatform(platform, userId = null) {
  // Try platform-specific first
  let { rows } = await pool.query(
    'SELECT * FROM prompts WHERE platform = $1 AND is_active = true ORDER BY is_default DESC LIMIT 1',
    [platform]
  );

  // Fall back to master prompt
  if (rows.length === 0) {
    ({ rows } = await pool.query(
      "SELECT * FROM prompts WHERE platform = 'all' AND is_active = true ORDER BY is_default DESC LIMIT 1"
    ));
  }

  return rows[0] || null;
}

export async function findById(id, userId = null) {
  const { rows } = await pool.query('SELECT * FROM prompts WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function create(data, userId = null) {
  const { name, platform, prompt_text, is_active } = data;

  const { rows } = await pool.query(
    `INSERT INTO prompts (name, platform, prompt_text, is_active)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, platform || 'all', prompt_text, is_active !== false]
  );
  return rows[0];
}

export async function update(id, data, userId = null) {
  const { name, platform, prompt_text, is_active } = data;

  const { rows } = await pool.query(
    `UPDATE prompts SET
      name = COALESCE($1, name),
      platform = COALESCE($2, platform),
      prompt_text = COALESCE($3, prompt_text),
      is_active = COALESCE($4, is_active),
      updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [name, platform, prompt_text, is_active, id]
  );
  return rows[0] || null;
}

export async function remove(id, userId = null) {
  const { rowCount } = await pool.query('DELETE FROM prompts WHERE id = $1', [id]);
  return rowCount > 0;
}
