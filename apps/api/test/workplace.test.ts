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
    FILES_SECRET: 'test-only-file-secret-long-enough-for-storage',
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
  const signUp = (email: string, token: unknown, pass = password) => sync('/api/auth/sign-up/email', { name: 'Guest', handle: email.toLowerCase().split('@')[0]!.replace(/[^a-z0-9_]/g, '_'), email, password: pass, token })
  assert.equal((await signUp('invalid-email', undefined)).statusCode, 400)
  assert.equal((await signUp('short@example.test', undefined, 'short')).statusCode, 400)
  const publicAccount = await signUp('PUBLIC@example.test', undefined)
  assert.equal(publicAccount.statusCode, 200, publicAccount.body)
  assert.equal(publicAccount.json().user.handle, 'public')
  assert.equal((await sync('/api/auth/sign-up/email', { name: 'No handle', email: 'missing@example.test', password })).statusCode, 400)
  assert.equal((await sync('/api/auth/sign-up/email', { name: 'Collision', email: 'collision@example.test', password, handle: 'PUBLIC' })).statusCode, 409)
  assert.equal((await db.select().from(users).where(eq(users.email, 'collision@example.test'))).length, 0)
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
  assert.ok([200, 400, 409, 422].includes(duplicate.statusCode))
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
  assert.deepEqual((await sync(`${path(clientId)}?before=${root}`, undefined, guestCookie)).json(), { readCursor: 0, messages: [], more: false })

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

  const ownerId = (await sync('/api/session', undefined, ownerCookie)).json().id
  const memberId = (await sync('/api/session', undefined, memberCookie)).json().id
  const profileOwner = await sync('/api/profile', { name: 'Owner Profile', handle: 'owner_profile', bio: 'Operations' }, ownerCookie)
  assert.equal(profileOwner.statusCode, 200, profileOwner.body)
  assert.equal((await sync('/api/profile', { name: 'Member Profile', handle: 'member_profile', bio: 'Field service' }, memberCookie)).statusCode, 200)
  assert.equal((await sync('/api/profile', { name: 'Hijack', handle: 'OWNER_PROFILE', bio: '' }, memberCookie)).statusCode, 409)
  assert.equal((await sync('/api/session', undefined, memberCookie)).json().name, 'Member Profile')
  const publicProfile = (await sync('/api/profiles/owner_profile')).json()
  assert.equal(publicProfile.name, 'Owner Profile')
  assert.equal(publicProfile.bio, 'Operations')
  assert.equal(Object.hasOwn(publicProfile, 'email'), false)
  assert.equal((await sync('/api/profiles/does_not_exist')).statusCode, 404)
  assert.equal((await sync('/api/profile', { name: 'Owner', handle: '../bad', bio: '' }, ownerCookie)).statusCode, 400)

  const [directA, directB] = await Promise.all([
    sync('/api/direct', { handle: 'member_profile' }, ownerCookie),
    sync('/api/direct', { userId: ownerId }, memberCookie),
  ])
  assert.equal(directA.statusCode, 200, directA.body)
  assert.equal(directB.statusCode, 200, directB.body)
  assert.equal(directA.json().id, directB.json().id)
  const directId = directA.json().id
  assert.equal((await sync('/api/direct', { userId: ownerId }, ownerCookie)).statusCode, 400)
  assert.equal((await sync('/api/direct', undefined, ownerCookie)).json().length, 1)
  assert.equal((await sync('/api/direct', undefined, memberCookie)).json()[0].name, 'Owner Profile')
  assert.equal((await sync('/api/direct', undefined, freshCookie)).json().length, 0)
  assert.equal((await sync(path(directId), undefined, freshCookie)).statusCode, 404)
  const directMessage = await sync(path(directId), { body: 'Private message', clientId: randomUUID() }, ownerCookie)
  assert.equal(directMessage.statusCode, 201, directMessage.body)
  assert.equal((await sync(path(directId), undefined, memberCookie)).json().messages[0].body, 'Private message')
  assert.equal((await sync(`${path(directId)}/${directMessage.json().id}/edit`, { body: 'Wrong author' }, memberCookie)).statusCode, 404)
  assert.equal((await sync(`${path(directId)}/${directMessage.json().id}/edit`, { body: 'Revised private' }, ownerCookie)).statusCode, 200)

  // Real HTTP SSE framing and authorization. PGlite does not forward notifications across connections.
  const base = await app.listen({ host: '127.0.0.1', port: 0 })
  const abort = new AbortController()
  t.after(() => abort.abort())
  const stream = await fetch(`${base}/api/channels/${directId}/events`, { headers: { cookie: memberCookie }, signal: abort.signal })
  assert.equal(stream.status, 200)
  assert.match(stream.headers.get('content-type')!, /text\/event-stream/)
  const reader = stream.body!.getReader()
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: ready/)
  const next = reader.read()
  await sync(path(directId), { body: 'Live stream update', clientId: randomUUID() }, ownerCookie)
  const event = await Promise.race([next, new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('SSE notification timeout')), 4000); timer.unref() })])
  assert.match(new TextDecoder().decode(event.value), /event: messages/)
  abort.abort()
  assert.equal((await fetch(`${base}/api/channels/${directId}/events`, { headers: { cookie: freshCookie } })).status, 404)

  const revocableCookie = cookieFrom(await sync('/api/auth/sign-in/email', { email: memberEmail, password }))
  const revokeAbort = new AbortController()
  t.after(() => revokeAbort.abort())
  const revokedStream = await fetch(`${base}/api/channels/${directId}/events`, { headers: { cookie: revocableCookie }, signal: revokeAbort.signal })
  const revokedReader = revokedStream.body!.getReader()
  await revokedReader.read()
  const revokedEvent = (async () => { let text = ''; while (!text.includes('event: access-revoked')) { const chunk = await revokedReader.read(); if (chunk.done) break; text += new TextDecoder().decode(chunk.value) } return text })()
  assert.equal((await sync('/api/auth/sign-out', {}, revocableCookie)).statusCode, 200)
  await sync(path(directId), { body: 'Revalidate revoked session', clientId: randomUUID() }, ownerCookie)
  assert.match(await revokedEvent, /event: access-revoked/)
  revokeAbort.abort()
  assert.equal((await sync('/api/session', undefined, memberCookie)).statusCode, 200)

  const uploadId = randomUUID()
  const upload = await sync(`/api/channels/${directId}/uploads`, { id: uploadId, name: 'field-report.pdf', size: 9, mime: 'application/pdf' }, ownerCookie)
  assert.equal(upload.statusCode, 200, upload.body)
  assert.equal((await sync(`/api/channels/${directId}/uploads`, { id: randomUUID(), name: '../bad.html', size: 9, mime: 'text/html' }, ownerCookie)).statusCode, 400)
  assert.equal((await sync(`/api/channels/${directId}/uploads`, { id: randomUUID(), name: 'huge.zip', size: 51 * 1024 * 1024, mime: 'application/zip' }, ownerCookie)).statusCode, 400)
  assert.equal((await sync(`/api/channels/${directId}/uploads`, { id: randomUUID(), name: 'secret.pdf', size: 9, mime: 'application/pdf' }, freshCookie)).statusCode, 404)
  assert.equal((await sync(path(directId), { attachmentIds: [uploadId], clientId: randomUUID() }, ownerCookie)).statusCode, 400)
  const internal = async (url: string, cookie: string, data?: object) => app.inject({ method: data ? 'POST' : 'GET', url, payload: data,
    headers: { origin, cookie, 'x-files-secret': config.FILES_SECRET } })
  assert.equal((await sync(`/api/internal/files/${uploadId}?upload=1`, undefined, ownerCookie)).statusCode, 403)
  assert.equal((await internal(`/api/internal/files/${uploadId}?upload=1`, memberCookie)).statusCode, 403)
  assert.equal((await internal(`/api/internal/files/${uploadId}?upload=1`, ownerCookie)).json().key, `attachments/${uploadId}`)
  assert.equal((await internal(`/api/internal/files/${uploadId}/complete`, ownerCookie, {})).statusCode, 200)
  const fileMessage = await sync(path(directId), { attachmentIds: [uploadId], location: { latitude: -22.7, longitude: -47.6 }, clientId: randomUUID() }, ownerCookie)
  assert.equal(fileMessage.statusCode, 201, fileMessage.body)
  const fileRow = (await sync(path(directId), undefined, memberCookie)).json().messages.find((item: { id: number }) => item.id === fileMessage.json().id)
  assert.equal(fileRow.attachments[0].name, 'field-report.pdf')
  assert.equal(fileRow.location.latitude, -22.7)
  assert.equal((await internal(`/api/internal/files/${uploadId}`, memberCookie)).statusCode, 200)
  assert.equal((await internal(`/api/internal/files/${uploadId}`, freshCookie)).statusCode, 404)
  assert.equal((await sync(path(general.id), { attachmentIds: [uploadId], clientId: randomUUID() }, ownerCookie)).statusCode, 400)
  await sync(`${path(directId)}/${fileMessage.json().id}/cancel`, {}, ownerCookie)
  assert.equal((await internal(`/api/internal/files/${uploadId}`, memberCookie)).statusCode, 404)

  assert.equal((await sync(`/api/teams/${teamId}/members`, undefined, memberCookie)).statusCode, 403)
  const managed = (await sync(`/api/teams/${teamId}/members`, undefined, ownerCookie)).json()
  assert.ok(managed.some((person: { id: string }) => person.id === memberId))
  assert.equal(Object.hasOwn(managed[0], 'email'), false)
  const guestMember = managed.find((person: { role: string }) => person.role === 'guest')
  assert.ok(guestMember)
  const newGuestLogin = await sync('/api/auth/sign-in/email', { email: guestEmail, password })
  const newGuestCookie = cookieFrom(newGuestLogin)
  assert.equal((await sync(path(clientId), undefined, newGuestCookie)).statusCode, 200)
  assert.equal((await sync(`/api/teams/${teamId}/remove-member`, { userId: guestMember.id }, ownerCookie)).statusCode, 200)
  assert.equal((await sync(path(clientId), undefined, newGuestCookie)).statusCode, 404)
  assert.equal((await sync('/api/invitations/accept', { token: guestToken }, newGuestCookie)).statusCode, 400)

  assert.equal((await sync(`/api/teams/${teamId}/update`, { name: 'Renamed Support' }, memberCookie)).statusCode, 403)
  assert.equal((await sync(`/api/teams/${teamId}/update`, { name: 'Renamed Support' }, ownerCookie)).statusCode, 200)
  assert.equal((await sync(`/api/teams/${teamId}/remove-member`, { userId: ownerId }, ownerCookie)).statusCode, 400)
  const oldInvite = await invite(teamId, memberEmail)
  assert.equal((await sync(`/api/teams/${teamId}/remove-member`, { userId: memberId }, ownerCookie)).statusCode, 200)
  assert.equal((await sync(path(general.id), undefined, memberCookie)).statusCode, 404)
  assert.equal((await sync('/api/invitations/accept', { token: oldInvite }, memberCookie)).statusCode, 400)
  assert.equal((await sync(path(directId), undefined, memberCookie)).statusCode, 200)
  const activeInvite = await invite(teamId, 'future@example.test')
  assert.equal((await sync(`/api/teams/${teamId}/delete`, { name: 'Wrong name' }, ownerCookie)).statusCode, 400)
  assert.equal((await sync(`/api/teams/${teamId}/delete`, { name: 'Renamed Support' }, freshCookie)).statusCode, 403)
  assert.equal((await sync(`/api/teams/${teamId}/delete`, { name: 'Renamed Support' }, ownerCookie)).statusCode, 200)
  assert.equal((await sync('/api/teams', undefined, ownerCookie)).json().some((item: { id: string }) => item.id === teamId), false)
  assert.equal((await sync(channelList, undefined, ownerCookie)).json().length, 0)
  assert.equal((await sync(path(clientId), undefined, ownerCookie)).statusCode, 404)
  assert.equal((await sync(path(directId), undefined, ownerCookie)).statusCode, 200)
  assert.equal((await signUp('future@example.test', activeInvite)).statusCode, 400)

})
