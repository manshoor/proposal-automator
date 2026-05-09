import pool from '../db/pool.js';

export async function findByEmail(email: string): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

export async function findById(id: string): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function create({ email, passwordHash, fullName }: { email: string; passwordHash: string; fullName?: string }): Promise<Record<string, unknown>> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, full_name)
     VALUES ($1, $2, $3) RETURNING *`,
    [email, passwordHash, fullName || '']
  );
  return rows[0];
}

export async function update(id: string, data: { fullName?: string; isActive?: boolean }): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(
    `UPDATE users SET
      full_name = COALESCE($1, full_name),
      is_active = COALESCE($2, is_active),
      updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [data.fullName ?? null, data.isActive ?? null, id]
  );
  return rows[0] || null;
}

export async function findAll(): Promise<Record<string, unknown>[]> {
  const { rows } = await pool.query(
    `SELECT id, email, full_name, role, is_active, created_at FROM users ORDER BY created_at DESC`
  );
  return rows;
}

export async function updateRole(id: string, role: string): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(
    `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2
     RETURNING id, email, full_name, role, is_active, created_at`,
    [role, id]
  );
  return rows[0] || null;
}
