import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();

// Node.js default metrics (GC, event loop, memory, etc.)
collectDefaultMetrics({ register });

// ---- HTTP metrics ----

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpErrorTotal = new Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors (4xx and 5xx)',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// ---- LLM metrics ----

export const llmRequestDuration = new Histogram({
  name: 'llm_request_duration_seconds',
  help: 'Duration of LLM API calls in seconds',
  labelNames: ['provider', 'endpoint'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [register],
});

export const llmRequestTotal = new Counter({
  name: 'llm_requests_total',
  help: 'Total number of LLM API calls',
  labelNames: ['provider', 'status'],
  registers: [register],
});

// ---- Database metrics ----

export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

// ---- Business metrics ----

export const proposalsGenerated = new Counter({
  name: 'proposals_generated_total',
  help: 'Total number of proposals generated',
  labelNames: ['platform'],
  registers: [register],
});

export const activeUsersGauge = new Gauge({
  name: 'active_authenticated_users',
  help: 'Number of unique authenticated users in the last request batch',
  registers: [register],
});
