// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/async-handler.js';
import { saveLoomUpload } from '../services/upload-loom.service.js';
import { ValidationError } from '../lib/errors.js';

const router = Router();

// Use memoryStorage so the service receives file.buffer directly.
// Switch to diskStorage if files regularly approach the 100 MB ceiling and
// heap pressure becomes a concern — the service already handles both via
// file.buffer (memory) today; a diskStorage path would require fs.rename instead.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB hard stop at the transport layer
});

/**
 * Wrap multer's single-file middleware so that its errors (notably
 * LIMIT_FILE_SIZE) are converted to a ValidationError and forwarded to the
 * global error handler as a 400, not a 413 with the generic screenshot message.
 */
function loomUploadMiddleware(req, res, next) {
  upload.single('video')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new ValidationError('File too large; max 100MB for Loom uploads'));
    }

    // Any other multer error (unexpected field, etc.) — pass through as-is so
    // the global error handler can log and respond appropriately.
    return next(err);
  });
}

/**
 * POST /api/v1/uploads/loom
 *
 * Accepts a screen-recording blob as multipart/form-data.
 * Field name must be "video". Supported MIME types: video/webm, video/mp4,
 * video/x-matroska. Max size: 100 MB.
 *
 * Requires authentication (enforced by the v1 router before this handler).
 *
 * Returns 201 with:
 *   { url, filename, size, mimeType, userId, uploadedAt }
 */
router.post('/', loomUploadMiddleware, asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ValidationError('No video file uploaded (field name must be "video")');
  }

  const result = await saveLoomUpload(req.file, req.user.id, req.log);
  res.status(201).json(result);
}));

export default router;