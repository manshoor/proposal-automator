import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ValidationError, AppError } from '../lib/errors.js';

/**
 * MIME types accepted for Loom-style screen recordings and the file
 * extension each maps to when persisted on disk.
 */
const ALLOWED_MIMES = {
  'video/webm': '.webm',
  'video/mp4': '.mp4',
  'video/x-matroska': '.mkv',
};

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Validate, persist, and return metadata for a Loom screen-recording upload.
 *
 * Required env vars:
 *   BACKEND_PUBLIC_URL  – publicly reachable base URL returned in the `url`
 *                         field (e.g. "https://api.example.com"). Falls back
 *                         to BACKEND_URL, then "http://localhost:3002".
 *
 * @param {{ buffer: Buffer, mimetype: string, size: number }} file
 *   The multer file object (memoryStorage – file.buffer is populated).
 * @param {string} userId  UUID of the authenticated user making the upload.
 * @param {object} logger  Pino-compatible logger (req.log from pino-http).
 * @returns {Promise<{
 *   url: string,
 *   filename: string,
 *   size: number,
 *   mimeType: string,
 *   userId: string,
 *   uploadedAt: string
 * }>}
 */
export async function saveLoomUpload(file, userId, logger) {
  // --- Validate MIME type ---
  const ext = ALLOWED_MIMES[file.mimetype];
  if (!ext) {
    throw new ValidationError(
      `Unsupported video type "${file.mimetype}". Allowed: ${Object.keys(ALLOWED_MIMES).join(', ')}.`,
    );
  }

  // --- Validate file size (belt-and-suspenders; multer enforces this too) ---
  if (file.size > MAX_BYTES) {
    throw new ValidationError('File too large; max 100MB for Loom uploads');
  }

  // --- Generate unique filename ---
  const uuid = crypto.randomUUID();
  const filename = `${uuid}${ext}`;

  // --- Resolve storage path ---
  const loomDir = join(process.cwd(), 'uploads', 'loom');
  const filePath = join(loomDir, filename);

  // --- Persist to disk ---
  try {
    mkdirSync(loomDir, { recursive: true });
    writeFileSync(filePath, file.buffer);
  } catch (err) {
    logger.error({ err, filePath }, 'Failed to write Loom upload to disk');
    throw new AppError('Loom upload could not be saved', 500, 'LOOM_UPLOAD_FAILED');
  }

  // --- Build public URL ---
  const baseUrl = (
    process.env.BACKEND_PUBLIC_URL ||
    process.env.BACKEND_URL ||
    'http://localhost:3002'
  ).replace(/\/$/, ''); // strip trailing slash

  const url = `${baseUrl}/uploads/loom/${filename}`;

  logger.info({ userId, filename, size: file.size, mimeType: file.mimetype }, 'Loom upload saved');

  return {
    url,
    filename,
    size: file.size,
    mimeType: file.mimetype,
    userId,
    uploadedAt: new Date().toISOString(),
  };
}
