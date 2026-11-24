import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createApp } from '../src/app.js'
import { createEmailVerificationToken } from 'better-auth/api'
import { connect } from '../src/database.js'
import type { VerificationEmail } from '../src/email.js'

test('message reactions enforce access, preserve other users and invalidate cached pages', async (t) => {
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
  const accounts = []
  for (const handle of ['alice', 'bob', 'outsider']) {
    const response = await call('/api/auth/sign-up/email', { name: handle, handle, email: `${handle}@example.test`, password: 'password-12345' })
    assert.equal(response.statusCode, 200, response.body)
    accounts.push({ id: response.json().user.id, cookie: cookieFrom(response) })
  }
  const [alice, bob, outsider] = accounts as [{ id: string; cookie: string }, { id: string; cookie: string }, { id: string; cookie: string }]
  const direct = (await call('/api/direct', { userId: bob.id }, alice.cookie)).json()
  const team = (await call('/api/teams', { name: 'Test team' }, alice.cookie)).json()
  const channel = (await call(`/api/teams/${team.id}/channels`, undefined, alice.cookie)).json()[0]
  for (const channelId of [direct.id, channel.id]) {
    const path = `/api/channels/${channelId}/messages`
    const message = (await call(path, { body: 'React here' }, alice.cookie)).json()
    const endpoint = `${path}/${message.id}/reaction`
    assert.deepEqual((await call(path, undefined, alice.cookie)).json().messages[0].reactions, [])
    assert.equal((await call(endpoint, { emoji: '👍', active: true })).statusCode, 401)
    assert.equal((await call(endpoint, { emoji: '👍', active: true }, outsider.cookie)).statusCode, 404)
    assert.equal((await call(endpoint, { emoji: 'invalid', active: true }, alice.cookie)).statusCode, 400)
    for (let n = 0; n < 2; n++) assert.equal((await call(endpoint, { emoji: '👍', active: true }, alice.cookie)).statusCode, 200)
    let rows = (await call(path, undefined, alice.cookie)).json().messages[0].reactions
    assert.deepEqual(rows, [{ emoji: '👍', users: [alice.id], count: 1 }])
    if (channelId === direct.id) {
      assert.equal((await call(endpoint, { emoji: '👍', active: true }, bob.cookie)).statusCode, 200)
      rows = (await call(path, undefined, bob.cookie)).json().messages[0].reactions
      assert.equal(rows[0].count, 2)
    }
    assert.equal((await call(endpoint, { emoji: '❤️', active: true }, alice.cookie)).statusCode, 200)
    assert.equal((await call(endpoint, { emoji: '👍', active: false }, alice.cookie)).statusCode, 200)
    rows = (await call(path, undefined, alice.cookie)).json().messages[0].reactions
    assert.equal(rows.find((r: {emoji:string}) => r.emoji === '❤️').count, 1)
    const thumb = rows.find((r: {emoji:string}) => r.emoji === '👍')
    assert.equal(thumb?.count ?? 0, channelId === direct.id ? 1 : 0)
    await call(`${path}/${message.id}/cancel`, {}, alice.cookie)
    assert.equal((await call(endpoint, { emoji: '🎉', active: true }, alice.cookie)).statusCode, 404)
    assert.deepEqual((await call(path, undefined, alice.cookie)).json().messages[0].reactions, [])
  }
})
