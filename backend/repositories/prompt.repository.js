import pool from '../db/pool.js';

export async function findAll({ platform, active } = {}, userId = null) {
  let query = 'SELECT * FROM prompts';
  const conditions = [];
  const values = [];

  if (userId) {
    values.push(userId);
    conditions.push(`user_id = $${values.length}`);
  }
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
  // Single query: prefer platform-specific, fall back to 'all'
  if (userId) {
    const { rows } = await pool.query(
      `SELECT * FROM prompts
       WHERE user_id = $1 AND is_active = true AND (platform = $2 OR platform = 'all')
       ORDER BY (platform = $2) DESC, is_default DESC
       LIMIT 1`,
      [userId, platform]
    );
    return rows[0] || null;
  } else {
    const { rows } = await pool.query(
      `SELECT * FROM prompts
       WHERE is_active = true AND (platform = $1 OR platform = 'all')
       ORDER BY (platform = $1) DESC, is_default DESC
       LIMIT 1`,
      [platform]
    );
    return rows[0] || null;
  }
}

export async function findById(id, userId = null) {
  if (userId) {
    const { rows } = await pool.query('SELECT * FROM prompts WHERE id = $1 AND user_id = $2', [id, userId]);
    return rows[0] || null;
  } else {
    const { rows } = await pool.query('SELECT * FROM prompts WHERE id = $1', [id]);
    return rows[0] || null;
  }
}

export async function create(data, userId = null) {
  const { name, platform, prompt_text, is_active } = data;

  const columns = ['name', 'platform', 'prompt_text', 'is_active'];
  const values = [name, platform || 'all', prompt_text, is_active !== false];

  if (userId) {
    columns.push('user_id');
    values.push(userId);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO prompts (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  return rows[0];
}

export async function update(id, data, userId = null) {
  const { name, platform, prompt_text, is_active } = data;

  const values = [name, platform, prompt_text, is_active, id];
  let whereClause = 'WHERE id = $5';

  if (userId) {
    values.push(userId);
    whereClause += ` AND user_id = $${values.length}`;
  }

  const { rows } = await pool.query(
    `UPDATE prompts SET
      name = COALESCE($1, name),
      platform = COALESCE($2, platform),
      prompt_text = COALESCE($3, prompt_text),
      is_active = COALESCE($4, is_active),
      updated_at = NOW()
     ${whereClause} RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function remove(id, userId = null) {
  if (userId) {
    const { rowCount } = await pool.query('DELETE FROM prompts WHERE id = $1 AND user_id = $2', [id, userId]);
    return rowCount > 0;
  } else {
    const { rowCount } = await pool.query('DELETE FROM prompts WHERE id = $1', [id]);
    return rowCount > 0;
  }
}
