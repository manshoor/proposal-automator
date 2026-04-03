import { AppError } from '../lib/errors.js';

export function errorHandler(err, req, res, _next) {
  // Use pino-http's req.log if available, otherwise fall back to console
  const log = req.log || console;

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

  const response = {
    error: {
      code,
      message,
      ...(err.details ? { details: err.details } : {}),
      ...(req.id ? { requestId: req.id } : {}),
    },
  };

  // Include stack in development
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
