import pool from '../db/pool.js';

type Row = Record<string, unknown>;

export interface PromptListOptions {
  platform?: string;
  active?: boolean | string;
}

export async function findAll({ platform, active }: PromptListOptions = {}, userId: string | null = null): Promise<Row[]> {
  let query = 'SELECT * FROM prompts';
  const conditions: string[] = [];
  const values: unknown[] = [];

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

export async function findActiveForPlatform(platform: string, userId: string | null = null): Promise<Row | null> {
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

export async function findById(id: number | string, userId: string | null = null): Promise<Row | null> {
  if (userId) {
    const { rows } = await pool.query('SELECT * FROM prompts WHERE id = $1 AND user_id = $2', [id, userId]);
    return rows[0] || null;
  } else {
    const { rows } = await pool.query('SELECT * FROM prompts WHERE id = $1', [id]);
    return rows[0] || null;
  }
}

export async function create(data: Record<string, unknown>, userId: string | null = null): Promise<Row> {
  const { name, platform, prompt_text, is_active, type, is_global } = data;

  const columns: string[] = ['name', 'platform', 'prompt_text', 'is_active', 'type', 'is_global'];
  const values: unknown[] = [name, platform || 'all', prompt_text, is_active !== false, type || 'custom', is_global || false];

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

export async function update(id: number | string, data: Record<string, unknown>, userId: string | null = null): Promise<Row | null> {
  const { name, platform, prompt_text, is_active } = data;

  const values: unknown[] = [name, platform, prompt_text, is_active, id];
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

export async function remove(id: number | string, userId: string | null = null): Promise<boolean> {
  if (userId) {
    const { rowCount } = await pool.query('DELETE FROM prompts WHERE id = $1 AND user_id = $2', [id, userId]);
    return (rowCount ?? 0) > 0;
  } else {
    const { rowCount } = await pool.query('DELETE FROM prompts WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}

export async function findActiveByType(type: string, platform: string, userId: string): Promise<Row | null> {
  const { rows } = await pool.query(
    `SELECT * FROM prompts
     WHERE user_id = $1 AND type = $2 AND is_active = true
       AND (platform = $3 OR platform = 'all')
     ORDER BY (platform = $3) DESC
     LIMIT 1`,
    [userId, type, platform]
  );
  return rows[0] || null;
}

export async function findGlobalByType(type: string, platform: string): Promise<Row | null> {
  const { rows } = await pool.query(
    `SELECT * FROM prompts
     WHERE is_global = true AND type = $1 AND is_active = true
       AND (platform = $2 OR platform = 'all')
     ORDER BY (platform = $2) DESC
     LIMIT 1`,
    [type, platform]
  );
  return rows[0] || null;
}

export async function findAllGlobal(): Promise<Row[]> {
  const { rows } = await pool.query(
    `SELECT * FROM prompts WHERE is_global = true ORDER BY type, platform, created_at DESC`
  );
  return rows;
}
