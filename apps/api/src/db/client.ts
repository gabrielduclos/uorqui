import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

/** Lazily constructed: the public /health endpoint works without a database. */
export function createDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured; set it in apps/api/.env');
  }

  // HTTP driver is suitable for individual queries. Re-evaluate for interactive transactions.
  return drizzle({ client: neon(url), schema });
}
