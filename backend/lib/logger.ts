import pino, { type Logger } from 'pino';
import * as pinoHttpNs from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'http';

const pinoHttp = (pinoHttpNs as unknown as { default?: typeof pinoHttpNs }).default ?? pinoHttpNs;

const IS_PROD = process.env.NODE_ENV === 'production';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug'),
  ...(IS_PROD ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
  base: { service: 'upwork-backend' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.apiKey',
      '*.api_key',
      '*.password',
      '*.password_hash',
      '*.llm_api_key',
      '*.llm_api_key_encrypted',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.access_token',
      '*.refresh_token',
      '*.token_hash',
      '*.secret',
      '*.jwt',
      '*.DATABASE_URL',
      '*.REDIS_URL',
      '*.JWT_SECRET',
      '*.ENCRYPTION_KEY',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
});

export const requestLogger = (pinoHttp as unknown as (opts: object) => unknown)({
  logger,
  autoLogging: {
    ignore: (req: IncomingMessage) => req.url === '/health' || req.url === '/metrics',
  },
  customSuccessMessage: (req: IncomingMessage, res: ServerResponse) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req: IncomingMessage, res: ServerResponse) => `${req.method} ${req.url} ${res.statusCode}`,
  customLogLevel: (_req: IncomingMessage, res: ServerResponse, err: unknown) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
