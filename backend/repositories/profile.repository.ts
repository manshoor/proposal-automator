import pool from '../db/pool.js';

type Row = Record<string, unknown>;

export async function findFirst(userId: string | null = null): Promise<Row | null> {
  if (userId) {
    const { rows } = await pool.query('SELECT * FROM profiles WHERE user_id = $1 LIMIT 1', [userId]);
    return rows[0] || null;
  } else {
    const { rows } = await pool.query('SELECT * FROM profiles LIMIT 1');
    return rows[0] || null;
  }
}

export async function create(data: Record<string, unknown>, userId: string | null = null): Promise<Row> {
  const {
    full_name = '',
    title = '',
    summary = '',
    skills = [],
    experience = '',
    portfolio = '',
    default_hourly_rate = 50.0,
  } = data;

  const columns: string[] = ['full_name', 'title', 'summary', 'skills', 'experience', 'portfolio', 'default_hourly_rate'];
  const values: unknown[] = [full_name, title, summary, skills, experience, portfolio, default_hourly_rate];

  if (userId) {
    columns.push('user_id');
    values.push(userId);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO profiles (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  return rows[0];
}

export async function update(id: number | string, data: Record<string, unknown>, userId: string | null = null): Promise<Row | null> {
  const {
    full_name,
    title,
    summary,
    skills,
    experience,
    portfolio,
    default_hourly_rate,
  } = data;

  const values: unknown[] = [
    full_name ?? null,
    title ?? null,
    summary ?? null,
    skills ?? null,
    experience ?? null,
    portfolio ?? null,
    default_hourly_rate ?? null,
    id,
  ];

  let whereClause = 'WHERE id = $8';

  if (userId) {
    values.push(userId);
    whereClause += ` AND user_id = $${values.length}`;
  }

  const { rows } = await pool.query(
    `UPDATE profiles SET
      full_name = COALESCE($1, full_name),
      title = COALESCE($2, title),
      summary = COALESCE($3, summary),
      skills = COALESCE($4, skills),
      experience = COALESCE($5, experience),
      portfolio = COALESCE($6, portfolio),
      default_hourly_rate = COALESCE($7, default_hourly_rate),
      updated_at = NOW()
     ${whereClause}
     RETURNING *`,
    values
  );
  return rows[0] || null;
}
