import pool from '../db/pool.js';

type Row = Record<string, unknown>;

export async function findFirst(userId: string | null = null): Promise<Row | null> {
  if (userId) {
    const { rows } = await pool.query('SELECT * FROM settings WHERE user_id = $1 LIMIT 1', [userId]);
    return rows[0] || null;
  } else {
    const { rows } = await pool.query('SELECT * FROM settings LIMIT 1');
    return rows[0] || null;
  }
}

export async function ensureExists(userId: string | null = null): Promise<void> {
  if (userId) {
    const { rows: existing } = await pool.query('SELECT id FROM settings WHERE user_id = $1 LIMIT 1', [userId]);
    if (existing.length === 0) {
      await pool.query('INSERT INTO settings (user_id) VALUES ($1)', [userId]);
    }
  } else {
    const { rows: existing } = await pool.query('SELECT id FROM settings LIMIT 1');
    if (existing.length === 0) {
      await pool.query('INSERT INTO settings DEFAULT VALUES');
    }
  }
}

export async function update(data: Record<string, unknown>, userId: string | null = null): Promise<Row | null> {
  const {
    locations,
    min_spent,
    min_hire_rate,
    min_reviews,
    notification_enabled,
    notification_interval,
    budget_min,
    budget_max,
    skills_include,
    keywords_include,
    keywords_exclude,
    llm_provider,
    llm_api_key_encrypted,
    encryption_iv,
  } = data as Record<string, unknown>;

  const values: unknown[] = [
    locations || null,
    min_spent !== undefined ? min_spent : null,
    min_hire_rate !== undefined ? min_hire_rate : null,
    min_reviews !== undefined ? min_reviews : null,
    notification_enabled !== undefined ? notification_enabled : null,
    notification_interval !== undefined ? notification_interval : null,
    budget_min !== undefined ? budget_min : null,
    budget_max !== undefined ? budget_max : null,
    skills_include || null,
    keywords_include || null,
    keywords_exclude || null,
    llm_provider || null,
    llm_api_key_encrypted || null,
    encryption_iv || null,
  ];

  let whereClause: string;
  if (userId) {
    values.push(userId);
    whereClause = `WHERE user_id = $${values.length}`;
  } else {
    whereClause = 'WHERE id = (SELECT id FROM settings LIMIT 1)';
  }

  const { rows } = await pool.query(
    `UPDATE settings SET
      locations = COALESCE($1, locations),
      min_spent = COALESCE($2, min_spent),
      min_hire_rate = COALESCE($3, min_hire_rate),
      min_reviews = COALESCE($4, min_reviews),
      notification_enabled = COALESCE($5, notification_enabled),
      notification_interval = COALESCE($6, notification_interval),
      budget_min = $7,
      budget_max = $8,
      skills_include = COALESCE($9, skills_include),
      keywords_include = COALESCE($10, keywords_include),
      keywords_exclude = COALESCE($11, keywords_exclude),
      llm_provider = COALESCE($12, llm_provider),
      llm_api_key_encrypted = COALESCE($13, llm_api_key_encrypted),
      encryption_iv = COALESCE($14, encryption_iv),
      updated_at = NOW()
    ${whereClause}
    RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function getLLMConfig(userId: string | null = null): Promise<{
  llm_provider: string | null;
  llm_api_key_encrypted: string | null;
  encryption_iv: string | null;
} | null> {
  if (userId) {
    const { rows } = await pool.query(
      'SELECT llm_provider, llm_api_key_encrypted, encryption_iv FROM settings WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  } else {
    const { rows } = await pool.query(
      'SELECT llm_provider, llm_api_key_encrypted, encryption_iv FROM settings LIMIT 1'
    );
    return rows[0] || null;
  }
}
