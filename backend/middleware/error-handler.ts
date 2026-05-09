import multer from 'multer';
import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
    stack?: string;
  };
}

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  // Use pino-http's req.log if available, otherwise fall back to console
  const log = req.log || console;

  // Handle multer file-size errors with a clear 413 response
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    log.warn({ err }, 'File too large');
    res.status(413).json({
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds the 50MB size limit.',
        ...(req.id ? { requestId: req.id } : {}),
      },
    });
    return;
  }

  if (err instanceof AppError && err.isOperational) {
    log.warn({ err, code: err.code }, err.message);
  } else {
    log.error({ err }, 'Unexpected error');
  }

  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR';
  const message = err instanceof AppError
    ? err.message
    : 'An unexpected error occurred';

  const errAsAny = err as { details?: unknown; stack?: string };
  const response: ErrorResponseBody = {
    error: {
      code,
      message,
      ...(errAsAny.details ? { details: errAsAny.details } : {}),
      ...(req.id ? { requestId: req.id } : {}),
    },
  };

  // Include stack in development
  if (process.env.NODE_ENV !== 'production' && errAsAny.stack) {
    response.error.stack = errAsAny.stack;
  }

  res.status(statusCode).json(response);
};
