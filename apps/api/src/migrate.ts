import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { connect } from './database.js'
import { readConfig } from './config.js'

const { pool, db } = connect(readConfig())
try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    migrationsSchema: 'uorqui_workplace_migrations',
  })
} finally {
  await pool.end()
}
