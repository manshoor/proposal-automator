import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/async-handler.js';
import * as parseService from '../services/parse.service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', upload.single('resume'), asyncHandler(async (req, res) => {
  const result = await parseService.parseResume(req.file, req.body, req.log, req.user.id);
  res.json(result);
}));

export default router;
