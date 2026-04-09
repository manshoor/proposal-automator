import Redis from 'ioredis';
import { logger } from './logger.js';

let client = null;
let connected = false;

export function getClient() {
  if (client) return client;

  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  client = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) return null; // stop retrying
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  client.on('connect', () => {
    connected = true;
    logger.info('Redis connected');
  });

  client.on('error', (err) => {
    connected = false;
    logger.error({ err }, 'Redis error');
  });

  client.on('close', () => {
    connected = false;
  });

  return client;
}

export async function connectRedis() {
  const c = getClient();
  try {
    await c.connect();
  } catch (err) {
    logger.warn({ err }, 'Redis connection failed — caching disabled');
  }
}

export async function disconnectRedis() {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
    connected = false;
  }
}

export async function cacheGet(key) {
  if (!connected) return null;
  try {
    return await getClient().get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 300) {
  if (!connected) return;
  try {
    await getClient().set(key, value, 'EX', ttlSeconds);
  } catch {
    // silently fail — cache is optional
  }
}

export async function cacheDel(key) {
  if (!connected) return;
  try {
    await getClient().del(key);
  } catch {
    // silently fail
  }
}

export async function cacheDelPrefix(prefix) {
  if (!connected) return;
  try {
    const client = getClient();
    let cursor = '0';
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', prefix + '*', 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) await client.del(...keys);
    } while (cursor !== '0');
  } catch {
    // silently fail
  }
}
