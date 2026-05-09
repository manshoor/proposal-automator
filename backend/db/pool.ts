import pg from 'pg';
import { logger } from '../lib/logger.js';
import { dbQueryDuration } from '../lib/metrics.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Sized for ~28 endpoints + 3 LLM workers + 2 background workers; default Postgres max_connections is 100.
  max: 50,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

// Wrap pool.query to instrument with Prometheus metrics. We preserve the
// generic signature pg's pool.query exposes so callers can write
// `pool.query<MyRow>(text, values)` and get a typed `result.rows`.
const originalQuery = pool.query.bind(pool);

function extractOperation(text: unknown): string {
  if (typeof text !== 'string') return 'unknown';
  const match = text.trimStart().match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|BEGIN|COMMIT|ROLLBACK)/i);
  return match ? match[1].toUpperCase() : 'other';
}

// `pool.query` has multiple overloads; instead of recreating them all we
// cast through `any` to avoid fighting the pg type definitions. Callers see
// the original (wide) overload set unchanged.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pool as any).query = async function instrumentedQuery(text: unknown, ...args: unknown[]) {
  const operation = extractOperation(text);
  const end = dbQueryDuration.startTimer({ operation });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (originalQuery as any)(text, ...args);
    end();
    return result;
  } catch (err) {
    end();
    throw err;
  }
};

export default pool;
