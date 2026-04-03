import pg from 'pg';
import { logger } from '../lib/logger.js';
import { dbQueryDuration } from '../lib/metrics.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

// Wrap pool.query to instrument with Prometheus metrics
const originalQuery = pool.query.bind(pool);

function extractOperation(text) {
  if (typeof text !== 'string') return 'unknown';
  const match = text.trimStart().match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|BEGIN|COMMIT|ROLLBACK)/i);
  return match ? match[1].toUpperCase() : 'other';
}

pool.query = async function instrumentedQuery(text, ...args) {
  const operation = extractOperation(text);
  const end = dbQueryDuration.startTimer({ operation });
  try {
    const result = await originalQuery(text, ...args);
    end();
    return result;
  } catch (err) {
    end();
    throw err;
  }
};

export default pool;
