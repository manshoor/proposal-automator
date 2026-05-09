import pool from '../db/pool.js';

type Row = Record<string, unknown>;
type TemplateData = {
  name: string;
  content: string;
  variables?: unknown;
  is_default?: boolean;
};

export async function findAll(userId: string | null = null): Promise<Row[]> {
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

export async function findById(id: number | string, userId: string | null = null): Promise<Row | null> {
  // Full column list intentional — detail/edit path needs variables + is_default.
  if (userId) {
    const { rows } = await pool.query('SELECT * FROM templates WHERE id = $1 AND user_id = $2', [id, userId]);
    return rows[0] || null;
  } else {
    const { rows } = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
    return rows[0] || null;
  }
}

export async function create(data: TemplateData, userId: string | null = null): Promise<Row> {
  const { name, content, variables, is_default } = data;

  const columns: string[] = ['name', 'content', 'variables', 'is_default'];
  const values: unknown[] = [name, content, variables, is_default ?? false];

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

export async function update(id: number | string, data: Partial<TemplateData>, userId: string | null = null): Promise<Row | null> {
  const { name, content, variables, is_default } = data;

  const values: unknown[] = [name ?? null, content, variables, is_default ?? null, id];
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

export async function remove(id: number | string, userId: string | null = null): Promise<Row | null> {
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
