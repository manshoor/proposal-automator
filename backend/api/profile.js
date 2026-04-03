import { Router } from 'express';
import pool from '../db/pool.js';
import { cacheGet, cacheSet, cacheDel } from '../lib/redis.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { ValidationError, NotFoundError, ExternalServiceError } from '../lib/errors.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM profiles LIMIT 1');

  if (rows.length > 0) {
    return res.json(rows[0]);
  }

  // No profile yet — create a default one
  const insertResult = await pool.query(
    `INSERT INTO profiles (full_name, title, summary, skills, experience, portfolio, default_hourly_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    ['', '', '', [], '', '', 50.0]
  );

  return res.status(201).json(insertResult.rows[0]);
}));

router.put('/', asyncHandler(async (req, res) => {
  const {
    full_name,
    title,
    summary,
    skills,
    experience,
    portfolio,
    default_hourly_rate,
  } = req.body;

  // Ensure a profile row exists first
  const existing = await pool.query('SELECT id FROM profiles LIMIT 1');

  if (existing.rows.length === 0) {
    const insertResult = await pool.query(
      `INSERT INTO profiles (full_name, title, summary, skills, experience, portfolio, default_hourly_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        full_name ?? '',
        title ?? '',
        summary ?? '',
        skills ?? [],
        experience ?? '',
        portfolio ?? '',
        default_hourly_rate ?? 50.0,
      ]
    );
    return res.json(insertResult.rows[0]);
  }

  const profileId = existing.rows[0].id;

  const updateResult = await pool.query(
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
      profileId,
    ]
  );

  // Invalidate profile cache
  await cacheDel('profile');

  return res.json(updateResult.rows[0]);
}));

export default router;
