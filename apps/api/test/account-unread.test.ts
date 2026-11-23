import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createApp } from '../src/app.js'
import { createEmailVerificationToken } from 'better-auth/api'
import { connect } from '../src/database.js'
import type { VerificationEmail } from '../src/email.js'

test('verification, password rotation and persisted access-filtered unread cursors', async (t) => {
  const postgres = await PGlite.create()
  const socket = new PGLiteSocketServer({ db: postgres, port: 0, maxConnections: 10 })
  await socket.start()
  const config = { DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`,
    AUTH_SECRET: 'test-account-security-secret-long-enough', WEB_ORIGIN: 'http://localhost:5173', PORT: 3001 }
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
  const password = 'original-password-123'
  const owner = await call('/api/auth/sign-up/email', { name: 'Owner', handle: 'owner', email: 'owner@example.test', password })
  assert.equal(owner.statusCode, 200, owner.body)
  let cookie = cookieFrom(owner)
  const other = await call('/api/auth/sign-up/email', { name: 'Other', handle: 'other', email: 'other@example.test', password })
  assert.equal(other.statusCode, 200, other.body)
  const otherCookie = cookieFrom(other)
  assert.equal(deliveries.length, 2)
  assert.equal((await call('/api/session', undefined, cookie)).json().emailVerified, false)
  assert.equal((await call('/api/account/verification', {}, cookie)).statusCode, 200)
  assert.equal(deliveries.length, 3)
  const url = new URL(deliveries.at(-1)!.url)
  const verified = await call(url.pathname + url.search + '&callbackURL=https://evil.example', undefined, cookie)
  assert.equal(verified.statusCode, 302)
  assert.equal(verified.headers.location, config.WEB_ORIGIN + '/#email=verified')
  assert.equal((await call('/api/session', undefined, cookie)).json().emailVerified, true)
  assert.equal((await call('/api/account/verification', {}, cookie)).json().verified, true)
  assert.equal(deliveries.length, 3)
  assert.equal((await call('/api/auth/verify-email?token=invalid')).headers.location, config.WEB_ORIGIN + '/#email=invalid')
  const expiredToken = await createEmailVerificationToken(config.AUTH_SECRET, 'other@example.test', undefined, -1)
  assert.equal((await call('/api/auth/verify-email?token=' + expiredToken)).headers.location, config.WEB_ORIGIN + '/#email=invalid')
  assert.equal((await call('/api/session', undefined, otherCookie)).json().emailVerified, false)
  assert.equal((await call('/api/account/verification', {})).statusCode, 401)

  const direct = (await call('/api/direct', { userId: other.json().user.id }, cookie)).json()
  const path = `/api/channels/${direct.id}`
  const first = await call(path + '/messages', { body: 'First' }, otherCookie)
  const second = await call(path + '/messages', { body: 'Second' }, otherCookie)
  await call(path + '/messages', { body: 'Own message' }, cookie)
  const cancelled = await call(path + '/messages', { body: 'Cancelled' }, otherCookie)
  await call(`${path}/messages/${cancelled.json().id}/cancel`, {}, otherCookie)
  const team = (await call('/api/teams', { name: 'Private team' }, otherCookie)).json()
  const [hidden] = (await call(`/api/teams/${team.id}/channels`, undefined, otherCookie)).json()
  await call(`/api/channels/${hidden.id}/messages`, { body: 'Never expose' }, otherCookie)
  let unread = (await call('/api/unread', undefined, cookie)).json()
  assert.equal(unread.length, 1)
  assert.equal(unread[0].channelId, direct.id)
  assert.equal(unread[0].teamId, null)
  assert.equal(unread[0].count, 2)
  const page = (await call(path + '/messages', undefined, cookie)).json()
  assert.ok(page.readCursor >= second.json().id)
  assert.equal((await call(path + '/read', { lastMessageId: first.json().id }, cookie)).statusCode, 200)
  unread = (await call('/api/unread', undefined, cookie)).json()
  assert.equal(unread[0].count, 1)
  assert.equal((await call(path + '/read', { lastMessageId: second.json().id }, cookie)).statusCode, 200)
  assert.equal((await call(path + '/read', { lastMessageId: first.json().id }, cookie)).statusCode, 200)
  assert.deepEqual((await call('/api/unread', undefined, cookie)).json(), [])
  assert.equal((await call(path + '/read', { lastMessageId: 9999999 }, cookie)).statusCode, 400)
  assert.equal((await call(`/api/channels/${hidden.id}/read`, { lastMessageId: first.json().id }, cookie)).statusCode, 404)
  const reply = await call(path + '/messages', { body: 'A reply', thread: first.json().id }, otherCookie)
  unread = (await call('/api/unread', undefined, cookie)).json()
  assert.equal(unread[0].count, 1)
  assert.equal(unread[0].latestId, reply.json().id)
  // A new app instance reads the same persisted cursor.
  const restarted = await createApp(config, false)
  assert.equal((await restarted.inject({ url: '/api/unread', headers: { cookie } })).json()[0].count, 1)
  assert.equal((await restarted.inject({ method: 'POST', url: '/api/account/verification', payload: {}, headers: { origin: config.WEB_ORIGIN, cookie: otherCookie } })).json().code, 'EMAIL_UNAVAILABLE')
  await restarted.close()

  const oldSession = cookieFrom(await call('/api/auth/sign-in/email', { email: 'owner@example.test', password }))
  const bad = await call('/api/account/password', { currentPassword: 'incorrect', newPassword: 'new-password-123' }, cookie)
  assert.equal(bad.json().code, 'CURRENT_PASSWORD_INVALID')
  assert.equal((await call('/api/account/password', { currentPassword: password, newPassword: 'short' }, cookie)).statusCode, 400)
  const changed = await call('/api/account/password', { currentPassword: password, newPassword: 'new-password-123' }, cookie)
  assert.equal(changed.statusCode, 200, changed.body)
  assert.deepEqual(changed.json(), { changed: true })
  cookie = cookieFrom(changed)
  assert.equal((await call('/api/session', undefined, cookie)).statusCode, 200)
  assert.equal((await call('/api/session', undefined, oldSession)).statusCode, 401)
  assert.equal((await call('/api/auth/sign-in/email', { email: 'owner@example.test', password })).statusCode, 401)
  assert.equal((await call('/api/auth/sign-in/email', { email: 'owner@example.test', password: 'new-password-123' })).statusCode, 200)
  assert.equal((await call('/api/account/password', { currentPassword: password, newPassword: 'new-password-123' })).statusCode, 401)
})
