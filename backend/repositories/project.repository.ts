import pool from '../db/pool.js';

type Row = Record<string, unknown>;

export interface ProjectListOptions {
  category?: string;
  featured?: boolean | string;
}

export async function findAll({ category, featured }: ProjectListOptions = {}, userId: string | null = null): Promise<Row[]> {
  // Explicit column list — screenshots excluded (can be large base64/URL arrays) from list
  // queries; available via findById for the project detail/edit view.
  const cols = 'id, user_id, name, description, url, technologies, category, client_name, budget_range, duration, outcome, is_featured, created_at, updated_at';
  let query = `SELECT ${cols} FROM projects`;
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (userId) {
    values.push(userId);
    conditions.push(`user_id = $${values.length}`);
  }
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

export async function findById(id: number | string, userId: string | null = null): Promise<Row | null> {
  if (userId) {
    const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
    return rows[0] || null;
  } else {
    const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    return rows[0] || null;
  }
}

export async function create(data: Record<string, unknown>, userId: string | null = null): Promise<Row> {
  const { name, description, url, technologies, category, client_name, budget_range, duration, outcome, is_featured } = data;

  const columns: string[] = ['name', 'description', 'url', 'technologies', 'category', 'client_name', 'budget_range', 'duration', 'outcome', 'is_featured'];
  const values: unknown[] = [name, description || '', url || null, technologies || [], category || '', client_name || '', budget_range || '', duration || '', outcome || '', is_featured || false];

  if (userId) {
    columns.push('user_id');
    values.push(userId);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO projects (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  return rows[0];
}

export async function update(id: number | string, data: Record<string, unknown>, userId: string | null = null): Promise<Row | null> {
  const { name, description, url, technologies, category, client_name, budget_range, duration, outcome, is_featured, screenshots } = data;

  const values: unknown[] = [name, description, url || null, technologies, category, client_name, budget_range, duration, outcome, is_featured, id, screenshots || null];
  let whereClause = 'WHERE id = $11';

  if (userId) {
    values.push(userId);
    whereClause += ` AND user_id = $${values.length}`;
  }

  const { rows } = await pool.query(
    `UPDATE projects SET
      name = COALESCE($1, name), description = COALESCE($2, description),
      url = $3, technologies = COALESCE($4, technologies),
      category = COALESCE($5, category), client_name = COALESCE($6, client_name),
      budget_range = COALESCE($7, budget_range), duration = COALESCE($8, duration),
      outcome = COALESCE($9, outcome), is_featured = COALESCE($10, is_featured),
      screenshots = COALESCE($12, screenshots),
      updated_at = NOW()
     ${whereClause} RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function createMany(projects: Record<string, unknown>[], userId: string | null = null): Promise<Row[]> {
  if (!projects || projects.length === 0) return [];

  const columns: string[] = ['name', 'description', 'url', 'technologies', 'category', 'client_name', 'budget_range', 'duration', 'outcome'];
  if (userId) columns.push('user_id');

  const values: unknown[] = [];
  const rowPlaceholders: string[] = [];

  for (const p of projects) {
    const rowValues: unknown[] = [
      p.name || 'Untitled Project', p.description || '', p.url || null,
      p.technologies || [], p.category || 'Other', p.client_name || '',
      p.budget_range || '', p.duration || '', p.outcome || '',
    ];
    if (userId) rowValues.push(userId);

    const offset = values.length;
    const placeholders = rowValues.map((_, i) => `$${offset + i + 1}`).join(', ');
    rowPlaceholders.push(`(${placeholders})`);
    values.push(...rowValues);
  }

  const { rows } = await pool.query(
    `INSERT INTO projects (${columns.join(', ')}) VALUES ${rowPlaceholders.join(', ')} RETURNING *`,
    values
  );
  return rows;
}

export async function remove(id: number | string, userId: string | null = null): Promise<boolean> {
  if (userId) {
    const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
    return (rowCount ?? 0) > 0;
  } else {
    const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}
