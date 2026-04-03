import pool from '../db/pool.js';

export async function findFirst(userId = null) {
  const { rows } = await pool.query('SELECT * FROM profiles LIMIT 1');
  return rows[0] || null;
}

export async function create(data, userId = null) {
  const {
    full_name = '',
    title = '',
    summary = '',
    skills = [],
    experience = '',
    portfolio = '',
    default_hourly_rate = 50.0,
  } = data;

  const { rows } = await pool.query(
    `INSERT INTO profiles (full_name, title, summary, skills, experience, portfolio, default_hourly_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [full_name, title, summary, skills, experience, portfolio, default_hourly_rate]
  );
  return rows[0];
}

export async function update(id, data, userId = null) {
  const {
    full_name,
    title,
    summary,
    skills,
    experience,
    portfolio,
    default_hourly_rate,
  } = data;

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
     WHERE id = $8
     RETURNING *`,
    [
      full_name ?? null,
      title ?? null,
      summary ?? null,
      skills ?? null,
      experience ?? null,
      portfolio ?? null,
      default_hourly_rate ?? null,
      id,
    ]
  );
  return rows[0] || null;
}
