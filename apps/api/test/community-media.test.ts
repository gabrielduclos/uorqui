import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createApp } from '../src/app.js'
import { connect } from '../src/database.js'
import { attachments, channelMembers, memberships, messages } from '../src/schema.js'

test('community levels, channel updates and paged media preserve access boundaries', async (t) => {
  const postgres = await PGlite.create()
  const socket = new PGLiteSocketServer({ db: postgres, port: 0, maxConnections: 10 })
  await socket.start()
  const config = { DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`,
    AUTH_SECRET: 'test-community-level-secret-long-enough', WEB_ORIGIN: 'http://localhost:5173', PORT: 3001 }
  const setup = connect(config)
  await migrate(setup.db, { migrationsFolder: './drizzle', migrationsSchema: 'uorqui_workplace_migrations' })
  const app = await createApp(config, false, async () => {})
  t.after(async () => { await app.close(); await setup.pool.end(); await socket.stop(); await postgres.close() })
  const call = (url: string, data?: object, cookie?: string) => app.inject({ method: data ? 'POST' : 'GET', url, payload: data,
    remoteAddress: data && 'handle' in data ? `192.0.2.${accounts.length + 1}` : '192.0.2.10',
    headers: { origin: config.WEB_ORIGIN, ...(cookie ? { cookie } : {}) } })
  const accounts = []
  for (const handle of ['owner', 'moderator', 'member', 'outsider']) {
    const response = await call('/api/auth/sign-up/email', { name: handle, handle, email: `${handle}@example.test`, password: 'password-12345' })
    assert.equal(response.statusCode, 200, response.body)
    const h = response.headers['set-cookie']
    accounts.push({ id: response.json().user.id as string, cookie: (Array.isArray(h) ? h : [h]).map((v) => v?.split(';')[0]).join('; ') })
  }
  const [owner, mod, member, outsider] = accounts as [typeof accounts[number], typeof accounts[number], typeof accounts[number], typeof accounts[number]]
  const team = (await call('/api/teams', { name: 'Community' }, owner.cookie)).json()
  await setup.db.insert(memberships).values([mod, member].map((u) => ({ teamId: team.id, userId: u.id, role: 'member' as const })))
  const rolePath = `/api/teams/${team.id}/member-role`
  const channelPath = `/api/teams/${team.id}/channels`
  assert.equal((await call(rolePath, { userId: member.id, role: 'moderator' }, member.cookie)).statusCode, 403)
  assert.equal((await call(rolePath, { userId: owner.id, role: 'member' }, owner.cookie)).statusCode, 400)
  assert.equal((await call(rolePath, { userId: outsider.id, role: 'moderator' }, owner.cookie)).statusCode, 400)
  assert.equal((await call(rolePath, { userId: mod.id, role: 'owner' }, owner.cookie)).statusCode, 400)
  assert.equal((await call(rolePath, { userId: mod.id, role: 'moderator' }, owner.cookie)).statusCode, 200)
  const input = { name: 'media', description: 'Photos', visibility: 'team' }
  assert.equal((await call(channelPath, input, member.cookie)).statusCode, 403)
  const created = await call(channelPath, input, mod.cookie)
  assert.equal(created.statusCode, 201, created.body)
  const channel = created.json()
  assert.equal((await call(`/api/teams/${team.id}/delete`, { name: 'Community' }, mod.cookie)).statusCode, 403)
  assert.equal((await call(rolePath, { userId: member.id, role: 'moderator' }, mod.cookie)).statusCode, 403)
  const updatePath = `/api/channels/${channel.id}/update`
  assert.equal((await call(updatePath, { ...input, name: 'changed' }, member.cookie)).statusCode, 403)
  assert.equal((await call(updatePath, { ...input, name: 'general' }, mod.cookie)).statusCode, 409)
  assert.equal((await call(updatePath, { ...input, name: 'changed' }, mod.cookie)).json().name, 'changed')
  const root = (await call(`/api/channels/${channel.id}/messages`, { body: 'Root' }, owner.cookie)).json()
  // Direct inserts isolate gallery eligibility and paging from upload transport, tested elsewhere.
  for (let n = 0; n < 53; n++) {
    const [message] = await setup.db.insert(messages).values({ channelId: channel.id, authorId: owner.id, parentId: n === 1 ? root.id : null, body: '',
      cancelledAt: n === 51 ? new Date() : null }).returning({ id: messages.id })
    await setup.db.insert(attachments).values({ id: randomUUID(), channelId: channel.id, authorId: owner.id, messageId: message!.id,
      name: `photo-${n}.png`, mime: n === 52 ? 'application/pdf' : 'image/png', size: 42, ready: n !== 50 })
    if (n === 3) await setup.db.insert(attachments).values({ id: randomUUID(), channelId: channel.id, authorId: owner.id, messageId: message!.id,
      name: 'second.png', mime: 'image/png', size: 42, ready: true })
  }
  const galleryPath = `/api/channels/${channel.id}/media`
  assert.equal((await call(galleryPath)).statusCode, 401)
  assert.equal((await call(galleryPath, undefined, outsider.cookie)).statusCode, 404)
  const page1 = (await call(galleryPath, undefined, member.cookie)).json()
  assert.equal(page1.items.length, 48)
  assert.ok(page1.next)
  const page2 = (await call(`${galleryPath}?before=${page1.next}`, undefined, member.cookie)).json()
  const all = [...page1.items, ...page2.items]
  assert.equal(all.length, 51)
  assert.equal(new Set(all.map((item) => item.id)).size, all.length)
  assert.equal(page2.next, null)
  assert.ok(all.some((item) => item.name === 'photo-1.png'), 'includes reply media')
  assert.ok(all.every((item, index) => index === 0 || item.messageId <= all[index - 1].messageId))
  assert.equal((await call(`${galleryPath}?before=invalid`, undefined, member.cookie)).statusCode, 400)
  await setup.db.insert(channelMembers).values({ channelId: channel.id, userId: outsider.id })
  assert.equal((await call(updatePath, { ...input, name: 'changed', visibility: 'private' }, mod.cookie)).statusCode, 200)
  assert.equal((await call(galleryPath, undefined, member.cookie)).statusCode, 404)
  assert.equal((await call(galleryPath, undefined, mod.cookie)).statusCode, 200)
  assert.equal((await call(galleryPath, undefined, outsider.cookie)).statusCode, 200)
  assert.equal((await call(updatePath, input, outsider.cookie)).statusCode, 403)
  const direct = (await call('/api/direct', { userId: mod.id }, owner.cookie)).json()
  assert.equal((await call(`/api/channels/${direct.id}/update`, input, owner.cookie)).statusCode, 403)
  assert.equal((await call(rolePath, { userId: mod.id, role: 'member' }, owner.cookie)).statusCode, 200)
  assert.equal((await call(updatePath, input, mod.cookie)).statusCode, 403)
})
