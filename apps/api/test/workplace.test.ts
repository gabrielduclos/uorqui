import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { eq } from 'drizzle-orm'
import { channelMembers, invitations, users } from '../src/schema.js'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createApp } from '../src/app.js'
import { connect } from '../src/database.js'

test('public account registration, team and private-channel conversations', async (t) => {
  const postgres = await PGlite.create()
  const socket = new PGLiteSocketServer({ db: postgres, port: 0, maxConnections: 10 })
  await socket.start()
  const config = {
    DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`,
    AUTH_SECRET: 'test-only-secret-long-enough-for-authentication',
    WEB_ORIGIN: 'http://localhost:5173',
    PORT: 3001,
  }
  const { pool, db, auth } = connect(config)
  const app = await createApp(config, false)
  t.after(async () => {
    await app.close()
    await pool.end()
    await socket.stop()
    await postgres.close()
  })
  for (let attempt = 0; attempt < 2; attempt++) {
    await migrate(db, { migrationsFolder: './drizzle', migrationsSchema: 'uorqui_workplace_migrations' })
  }
  const origin = config.WEB_ORIGIN
  const password = 'team-password-example'
  const ownerEmail = 'owner@example.test'
  const guestEmail = 'guest@example.test'
  const memberEmail = 'member@example.test'
  const clientAddresses = new Map<string, string>()
  const clientAddress = (data?: object) => {
    if (!data || !('email' in data) || typeof data.email !== 'string') return '127.0.0.1'
    const email = data.email.toLowerCase()
    if (!clientAddresses.has(email)) clientAddresses.set(email, `192.0.2.${clientAddresses.size + 1}`)
    return clientAddresses.get(email)
  }
  const sync = async (url: string, data?: object, cookie?: string) => app.inject({
    remoteAddress: clientAddress(data),
    method: data ? 'POST' : 'GET', url, payload: data, headers: { origin, ...(cookie ? { cookie } : {}) },
  })
  const path = (channel: string) => `/api/channels/${channel}/messages`
  const tokenFrom = (url: string) => new URLSearchParams(new URL(url).hash.slice(1)).get('invite')
  const cookieFrom = (response: Awaited<ReturnType<typeof sync>>) => {
    const header = response.headers['set-cookie']
    return (Array.isArray(header) ? header : [header]).map((item) => item?.split(';')[0]).join('; ')
  }
  const invite = async (team: string, email: string, channelId?: string) => {
    const response = await sync(`/api/teams/${team}/invitations`, { email, channelId }, ownerCookie)
    assert.equal(response.statusCode, 201)
    return tokenFrom(response.json().url)
  }

  assert.equal((await sync('/health/ready')).statusCode, 200)
  assert.equal((await sync('/api/teams')).statusCode, 401)
  assert.equal((await app.inject({ method: 'POST', url: '/api/teams', payload: { name: 'Wrong origin' } })).statusCode, 403)
  await auth.api.signUpEmail({ body: { name: 'Owner', email: ownerEmail, password } })
  const ownerLogin = await sync('/api/auth/sign-in/email', { email: ownerEmail, password })
  assert.equal(ownerLogin.statusCode, 200, ownerLogin.body)
  const ownerCookie = cookieFrom(ownerLogin)
  assert.equal((await sync('/api/session', undefined, ownerCookie)).statusCode, 200)

  const team = await sync('/api/teams', { name: 'Support' }, ownerCookie)
  assert.equal(team.statusCode, 201, team.body)
  const teamId = team.json().id
  const channelList = `/api/teams/${teamId}/channels`
  const [general] = (await sync(channelList, undefined, ownerCookie)).json()
  assert.equal(general.name, 'general')
  const privateChannel = await sync(channelList, { name: 'client-lumen', description: 'Field service', visibility: 'private' }, ownerCookie)
  assert.equal(privateChannel.statusCode, 201)
  const clientId = privateChannel.json().id
  assert.equal((await sync(channelList, { name: 'CLIENT-LUMEN', description: '', visibility: 'team' }, ownerCookie)).statusCode, 409)

  const guestToken = await invite(teamId, guestEmail, clientId)
  const memberToken = await invite(teamId, memberEmail)
  const signUp = (email: string, token: unknown, pass = password) => sync('/api/auth/sign-up/email', { name: 'Guest', email, password: pass, token })
  assert.equal((await signUp('invalid-email', undefined)).statusCode, 400)
  assert.equal((await signUp('short@example.test', undefined, 'short')).statusCode, 400)
  const publicAccount = await signUp('PUBLIC@example.test', undefined)
  assert.equal(publicAccount.statusCode, 200, publicAccount.body)
  const publicCookie = cookieFrom(publicAccount)
  assert.equal((await sync('/api/session', undefined, publicCookie)).json().email, 'public@example.test')
  assert.deepEqual((await sync('/api/teams', undefined, publicCookie)).json(), [])
  assert.deepEqual((await sync(channelList, undefined, publicCookie)).json(), [])
  assert.equal((await sync(path(general.id), undefined, publicCookie)).statusCode, 404)
  assert.equal((await sync(path(clientId), undefined, publicCookie)).statusCode, 404)
  assert.equal((await sync(channelList, { name: 'hidden', description: '', visibility: 'team' }, publicCookie)).statusCode, 403)
  assert.equal((await sync('/api/auth/sign-out', {}, publicCookie)).statusCode, 200)
  assert.equal((await sync('/api/auth/sign-in/email', { email: 'public@example.test', password })).statusCode, 200)
  const publicTeam = await sync('/api/teams', { name: 'Independent team' }, publicCookie)
  assert.equal(publicTeam.statusCode, 401)
  const freshLogin = await sync('/api/auth/sign-in/email', { email: 'public@example.test', password })
  const freshCookie = cookieFrom(freshLogin)
  assert.equal((await sync('/api/teams', { name: 'Independent team' }, freshCookie)).statusCode, 201)
  const duplicate = await signUp('public@example.test', undefined)
  assert.ok([200, 400, 422].includes(duplicate.statusCode))
  assert.equal((await db.select({ id: users.id }).from(users).where(eq(users.email, 'public@example.test'))).length, 1)
  assert.equal((await signUp(guestEmail, memberToken)).statusCode, 400)
  assert.equal((await signUp(guestEmail, guestToken, 'short')).statusCode, 400)
  const guest = await signUp(guestEmail, guestToken)
  assert.equal(guest.statusCode, 200, guest.body)
  const guestCookie = cookieFrom(guest)
  const member = await signUp(memberEmail, memberToken)
  assert.equal(member.statusCode, 200, member.body)
  const memberCookie = cookieFrom(member)
  const accept = '/api/invitations/accept'
  assert.equal((await sync(accept, { token: guestToken }, memberCookie)).statusCode, 400)
  assert.equal((await sync(accept, { token: guestToken }, guestCookie)).statusCode, 200)
  assert.equal((await sync(accept, { token: guestToken }, guestCookie)).statusCode, 200)
  assert.equal((await sync(accept, { token: memberToken }, memberCookie)).statusCode, 200)
  assert.equal((await sync('/api/teams', undefined, guestCookie)).json()[0].role, null)
  assert.deepEqual((await sync(channelList, undefined, guestCookie)).json().map((channel: { id: string }) => channel.id), [clientId])
  assert.deepEqual((await sync(channelList, undefined, memberCookie)).json().map((channel: { id: string }) => channel.id), [general.id])
  assert.equal((await sync(path(general.id), undefined, guestCookie)).statusCode, 404)
  assert.equal((await sync(path(clientId), { body: 'hidden channel' }, memberCookie)).statusCode, 404)
  assert.equal((await sync(channelList, { name: 'new', description: '', visibility: 'team' }, guestCookie)).statusCode, 403)
  assert.equal((await sync(path(clientId), { body: ' ' }, guestCookie)).statusCode, 400)

  const message = await sync(path(clientId), { body: 'First customer message' }, guestCookie)
  assert.equal(message.statusCode, 201, message.body)
  const root = message.json().id
  assert.equal((await sync(path(general.id), { body: 'Wrong channel', thread: root }, ownerCookie)).statusCode, 404)
  assert.equal((await sync(path(clientId), { body: 'Owner reply', thread: root }, ownerCookie)).statusCode, 201)
  const latest = (await sync(path(clientId), undefined, guestCookie)).json().messages
  assert.deepEqual(latest.map(({ body, replies }: { body: string; replies: number }) => [body, replies]), [['First customer message', 1]])
  const guestId = (await sync('/api/session', undefined, guestCookie)).json().id
  await db.delete(channelMembers).where(eq(channelMembers.userId, guestId))
  assert.equal((await sync(path(clientId), undefined, guestCookie)).statusCode, 404)
  await db.insert(channelMembers).values({ channelId: clientId, userId: guestId })
  const thread = (await sync(`${path(clientId)}?thread=${root}`, undefined, guestCookie)).json().messages
  assert.equal(thread[0].body, 'Owner reply')
  assert.equal((await sync(path(clientId), { body: 'No nested replies', thread: thread[0].id }, ownerCookie)).statusCode, 404)
  assert.deepEqual((await sync(`${path(clientId)}?before=${root}`, undefined, guestCookie)).json(), { messages: [], more: false })

  for (let index = 0; index < 55; index++) {
    assert.equal((await sync(path(clientId), { body: `Message ${index + 1}` }, ownerCookie)).statusCode, 201)
  }
  const recent = (await sync(path(clientId), undefined, guestCookie)).json()
  assert.equal(recent.messages.length, 50)
  assert.equal(recent.messages[0].body, 'Message 6')
  assert.equal(recent.more, true)
  const older = (await sync(`${path(clientId)}?before=${recent.messages[0].id}`, undefined, guestCookie)).json()
  assert.equal(older.messages.length, 6)
  assert.equal(older.messages[0].id, root)
  assert.equal(older.more, false)

  const requestId = randomUUID()
  const once = await sync(path(general.id), { body: 'Editable', clientId: requestId }, ownerCookie)
  const [again, again2] = await Promise.all([
    sync(path(general.id), { body: 'Editable', clientId: requestId }, ownerCookie),
    sync(path(general.id), { body: 'Editable', clientId: requestId }, ownerCookie),
  ])
  assert.equal(once.json().id, again.json().id)
  assert.equal(once.json().id, again2.json().id)
  const ownId = once.json().id
  const editUrl = `${path(general.id)}/${ownId}/edit`
  const cancelUrl = `${path(general.id)}/${ownId}/cancel`
  assert.equal((await sync(editUrl, { body: 'Other person' }, memberCookie)).statusCode, 404)
  assert.equal((await sync(cancelUrl, {}, memberCookie)).statusCode, 404)
  assert.equal((await sync(editUrl, { body: ' ' }, ownerCookie)).statusCode, 400)
  assert.equal((await sync(editUrl, { body: 'Revised' }, ownerCookie)).statusCode, 200)
  const edited = (await sync(path(general.id), undefined, ownerCookie)).json().messages.find((item: { id: number }) => item.id === ownId)
  assert.equal(edited.body, 'Revised')
  assert.ok(edited.editedAt)
  assert.equal((await sync(path(general.id), { body: 'Keep this reply', thread: ownId }, memberCookie)).statusCode, 201)
  assert.equal((await sync(cancelUrl, {}, ownerCookie)).statusCode, 200)
  const cancelled = (await sync(path(general.id), undefined, ownerCookie)).json().messages.find((item: { id: number }) => item.id === ownId)
  assert.equal(cancelled.body, '')
  assert.ok(cancelled.cancelledAt)
  assert.equal((await sync(editUrl, { body: 'Resurrect' }, ownerCookie)).statusCode, 404)
  assert.equal((await sync(cancelUrl, {}, ownerCookie)).statusCode, 200)
  assert.equal((await sync(path(general.id), { body: 'Editable', clientId: requestId }, ownerCookie)).json().id, ownId)
  assert.equal((await sync(`${path(general.id)}?thread=${ownId}`, undefined, memberCookie)).json().messages[0].body, 'Keep this reply')

  const expiredEmail = 'expired@example.test'
  const expiredInvite = await invite(teamId, expiredEmail, clientId)
  await db.update(invitations).set({ expiresAt: new Date(0) }).where(eq(invitations.email, expiredEmail))
  assert.equal((await signUp(expiredEmail, expiredInvite)).statusCode, 400)
  assert.equal((await sync('/api/auth/sign-out', {}, guestCookie)).statusCode, 200)
  assert.equal((await sync(path(clientId), undefined, guestCookie)).statusCode, 401)
})
