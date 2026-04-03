import { randomUUID } from 'crypto';

export function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
}
