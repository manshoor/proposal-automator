import { Router } from 'express';
import pool from '../db/pool.js';
import { encrypt } from '../lib/crypto.js';
import { invalidateLLMConfig } from '../lib/get-llm-config.js';
import { cacheDel } from '../lib/redis.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

const DEFAULTS = {
  locations: ['United Kingdom', 'United States', 'Canada', 'Singapore', 'Malaysia',
    'United Arab Emirates', 'Abu Dhabi', 'Dubai', 'Saudi Arabia', 'Qatar', 'Bahrain'],
  min_spent: 1000,
  min_hire_rate: 30,
  min_reviews: 3,
  notification_enabled: false,
  notification_interval: 5,
  budget_min: null,
  budget_max: null,
  skills_include: [],
  keywords_include: [],
  keywords_exclude: [],
};

// GET /api/settings — return settings (auto-create if not exists)
router.get('/', asyncHandler(async (_req, res) => {
  let { rows } = await pool.query('SELECT * FROM settings LIMIT 1');
  if (rows.length === 0) {
    const result = await pool.query(
      `INSERT INTO settings (locations, min_spent, min_hire_rate, min_reviews)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [DEFAULTS.locations, DEFAULTS.min_spent, DEFAULTS.min_hire_rate, DEFAULTS.min_reviews]
    );
    rows = result.rows;
  }
  const settings = rows[0];
  // Mask the API key — never return the raw encrypted value
  if (settings.llm_api_key_encrypted) {
    settings.llm_api_key_masked = '****' + settings.llm_api_key_encrypted.slice(-8);
    settings.llm_api_key_set = true;
  } else {
    settings.llm_api_key_masked = null;
    settings.llm_api_key_set = false;
  }
  delete settings.llm_api_key_encrypted;
  delete settings.encryption_iv;
  return res.json(settings);
}));

// PUT /api/settings — update settings
router.put('/', asyncHandler(async (req, res) => {
  const {
    locations, min_spent, min_hire_rate, min_reviews,
    notification_enabled, notification_interval,
    budget_min, budget_max, skills_include, keywords_include, keywords_exclude,
    llm_provider, llm_api_key
  } = req.body;

  // Ensure row exists
  const { rows: existing } = await pool.query('SELECT id FROM settings LIMIT 1');
  if (existing.length === 0) {
    await pool.query('INSERT INTO settings DEFAULT VALUES');
  }

  // Encrypt API key if provided
  let encryptedKey = undefined;
  let iv = undefined;
  if (llm_api_key) {
    const result = encrypt(llm_api_key);
    encryptedKey = result.encrypted;
    iv = result.iv;
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
    WHERE id = (SELECT id FROM settings LIMIT 1)
    RETURNING *`,
    [
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
      encryptedKey || null,
      iv || null,
    ]
  );

  // Invalidate caches when settings change
  await invalidateLLMConfig();
  await cacheDel('settings');

  const settings = rows[0];
  // Mask the API key in response
  if (settings.llm_api_key_encrypted) {
    settings.llm_api_key_masked = '****' + settings.llm_api_key_encrypted.slice(-8);
    settings.llm_api_key_set = true;
  } else {
    settings.llm_api_key_masked = null;
    settings.llm_api_key_set = false;
  }
  delete settings.llm_api_key_encrypted;
  delete settings.encryption_iv;

  return res.json(settings);
}));

export default router;
