import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  req.id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
}
