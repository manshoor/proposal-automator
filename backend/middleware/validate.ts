import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../lib/errors.js';

type RequestSource = 'body' | 'query' | 'params';

export function validate(schema: ZodTypeAny, source: RequestSource = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse((req as unknown as Record<string, unknown>)[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      throw new ValidationError('Validation failed', details);
    }
    // Use parsed/transformed data (strips unknown fields, applies defaults)
    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
}
