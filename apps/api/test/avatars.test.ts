import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createApp } from '../src/app.js'
import { createEmailVerificationToken } from 'better-auth/api'
import { connect } from '../src/database.js'
import type { VerificationEmail } from '../src/email.js'

test('avatar metadata enforces size, type, ownership and publication', async (t) => {
  const postgres = await PGlite.create()
  const socket = new PGLiteSocketServer({ db: postgres, port: 0, maxConnections: 10 })
  await socket.start()
  const config = { DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`,
    AUTH_SECRET: 'test-account-security-secret-long-enough', WEB_ORIGIN: 'http://localhost:5173', FILES_SECRET: 'avatar-test-only-files-secret-long-enough', PORT: 3001 }
  const setup = connect(config)
  await migrate(setup.db, { migrationsFolder: './drizzle', migrationsSchema: 'uorqui_workplace_migrations' })
  const deliveries: VerificationEmail[] = []
  const app = await createApp(config, false, async (email) => { deliveries.push(email) })
  t.after(async () => { await app.close(); await setup.pool.end(); await socket.stop(); await postgres.close() })
  const call = (url: string, data?: object, cookie?: string) => app.inject({ method: data ? 'POST' : 'GET', url, payload: data,
    remoteAddress: data && 'email' in data && data.email === 'other@example.test' ? '192.0.2.2' : '192.0.2.1',
    headers: { origin: config.WEB_ORIGIN, ...(cookie ? { cookie } : {}) } })
  const cookieFrom = (r: Awaited<ReturnType<typeof call>>) => {
    const h = r.headers['set-cookie']; return (Array.isArray(h) ? h : [h]).map((v) => v?.split(';')[0]).join('; ')
  }
  const owner = await call('/api/auth/sign-up/email', { name: 'Owner', handle: 'owner', email: 'owner@example.test', password: 'password-12345' })
  const cookie = cookieFrom(owner)
  assert.equal(owner.statusCode, 200)
  assert.equal((await call('/api/avatars/uploads', { id: crypto.randomUUID(), mime: 'image/png', size: 2 * 1024 * 1024 }, cookie)).statusCode, 400)
  assert.equal((await call('/api/avatars/uploads', { id: crypto.randomUUID(), mime: 'image/svg+xml', size: 20 }, cookie)).statusCode, 400)
  const id = crypto.randomUUID()
  assert.equal((await call('/api/avatars/uploads', { id, mime: 'image/png', size: 100 }, cookie)).statusCode, 200)
  assert.equal((await call('/api/internal/avatars/' + id, undefined, cookie)).statusCode, 403)
  const internal = (method: 'GET' | 'POST', url: string) => app.inject({ method, url, headers: { origin: config.WEB_ORIGIN, cookie, 'x-files-secret': config.FILES_SECRET } })
  assert.equal((await internal('GET', '/api/internal/avatars/' + id)).statusCode, 404)
  assert.equal((await internal('GET', '/api/internal/avatars/' + id + '?upload=1')).statusCode, 200)
  assert.equal((await internal('POST', '/api/internal/avatars/' + id + '/complete')).statusCode, 200)
  assert.equal((await call('/api/profile', undefined, cookie)).json().image, '/api/avatars/' + id)
  assert.equal((await internal('GET', '/api/internal/avatars/' + id)).statusCode, 200)
  await call('/api/avatars/remove', {}, cookie)
  assert.equal((await call('/api/profile', undefined, cookie)).json().image, null)
  assert.equal((await internal('GET', '/api/internal/avatars/' + id)).statusCode, 404)
})
