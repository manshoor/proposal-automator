import { httpRequestDuration, httpRequestTotal, httpErrorTotal } from '../lib/metrics.js';

export function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;

    // Normalize route to avoid high-cardinality labels
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.path;

    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode,
    };

    httpRequestDuration.observe(labels, durationSec);
    httpRequestTotal.inc(labels);

    if (res.statusCode >= 400) {
      httpErrorTotal.inc(labels);
    }
  });

  next();
}
