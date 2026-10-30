import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Generating SQL only needs the local schema. Applying a migration requires
// DATABASE_URL, which is supplied privately through the Neon console/secrets.
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});
