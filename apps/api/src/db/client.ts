import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as socialSchema from './schema.js';
import * as authSchema from './auth-schema.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool> | undefined;
const schema = { ...socialSchema, ...authSchema };

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

/** Lazily initializes the pool so /health works without Neon credentials. */
export function createDatabase() {
  return drizzle(getPool(), { schema });
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
