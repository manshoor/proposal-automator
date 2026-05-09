// Express module augmentation: add fields populated by our middleware.
// This file is included automatically because tsconfig.json picks up **/*.ts.
//
// - `user` is set by middleware/auth.authenticate
// - `log`  is set by pino-http (request-scoped child logger)
// - `id`   is set by middleware/request-id.requestId

import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; email: string; role: string };
    log?: {
      info: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
      debug: (...args: unknown[]) => void;
    };
    id?: string;
  }
}

export {};
