import pino from 'pino';
import pinoHttp from 'pino-http';

const IS_PROD = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug'),
  ...(IS_PROD ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
  base: { service: 'upwork-backend' },
  redact: {
    paths: ['req.headers.authorization', '*.apiKey', '*.api_key', '*.password', '*.llm_api_key'],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
});

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/metrics',
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
