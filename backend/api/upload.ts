// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { asyncHandler } from '../middleware/async-handler.js';
import { ValidationError } from '../lib/errors.js';

const router = Router();

// Ensure uploads directory exists
const UPLOAD_DIR = join(process.cwd(), 'uploads', 'screenshots');
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: (_req, file, cb) => {
    const allowedExt = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
    const allowedMime = /^image\/(jpeg|png|gif|webp|svg\+xml)$/;
    if (allowedExt.test(file.originalname) && allowedMime.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, webp, svg) are allowed'));
    }
  },
});

/**
 * POST /api/upload/screenshot
 * Upload 1-5 screenshots. Returns array of URLs.
 */
router.post('/screenshot', upload.array('screenshots', 5), asyncHandler((req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new ValidationError('No files uploaded');
  }

  const urls = req.files.map(f => `/uploads/screenshots/${f.filename}`);
  res.json({ urls });
}));

export default router;