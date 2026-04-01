import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, existsSync } from 'fs';
import { join, extname } from 'path';

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
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
    if (allowed.test(file.originalname)) {
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
router.post('/screenshot', upload.array('screenshots', 5), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const urls = req.files.map(f => `/uploads/screenshots/${f.filename}`);
  res.json({ urls });
});

export default router;
