import { promises as fs } from 'fs';
import path from 'path';
import pool from '../db/pool.js';
import { logger } from '../lib/logger.js';

const INTERVAL_MS = 24 * 60 * 60 * 1000;  // 24 hours
const STALE_THRESHOLD_DAYS = 90;

async function cleanupOrphanLooms() {
  const dir = path.join(process.cwd(), 'uploads', 'loom');
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return;  // no uploads yet — nothing to clean
    logger.warn({ err: e.message }, '[loom-cleanup] readdir failed');
    return;
  }

  if (entries.length === 0) return;

  // Find which filenames are still referenced by a proposals row
  const { rows } = await pool.query(
    `SELECT loom_url FROM proposals WHERE loom_url IS NOT NULL`
  );
  const referencedFilenames = new Set(
    (rows as { loom_url: string | null }[])
      .map((r) => r.loom_url)
      .filter((u): u is string => !!u)
      .map((url) => {
        const m = url.match(/\/uploads\/loom\/([^/?#]+)/);
        return m ? m[1] : null;
      })
      .filter((n): n is string => !!n)
  );

  const cutoffMs = Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;
  let kept = 0;

  for (const name of entries) {
    if (referencedFilenames.has(name)) {
      kept += 1;
      continue;
    }
    const fullPath = path.join(dir, name);
    try {
      const stats = await fs.stat(fullPath);
      if (stats.mtimeMs < cutoffMs) {
        await fs.unlink(fullPath);
        deleted += 1;
      } else {
        kept += 1;
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, file: name }, '[loom-cleanup] file op failed');
    }
  }

  if (deleted > 0 || kept > 0) {
    logger.info({ deleted, kept, dir }, '[loom-cleanup] sweep complete');
  }
}

let _intervalId: NodeJS.Timeout | null = null;

export function startLoomCleanupWorker() {
  if (_intervalId) return;
  // Defer first sweep — don't run at startup, let the server settle first
  _intervalId = setInterval(cleanupOrphanLooms, INTERVAL_MS);
  logger.info({ intervalHours: INTERVAL_MS / 3600000 },
    '[loom-cleanup] worker started');
}

export function stopLoomCleanupWorker() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}
