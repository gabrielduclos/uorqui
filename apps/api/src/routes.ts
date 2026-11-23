import { createHash, randomBytes } from 'node:crypto'
import { fromNodeHeaders } from 'better-auth/node'
import { and, asc, desc, eq, exists, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Config } from './config.js'
import type { Services } from './database.js'
import { registerWorkplaceRoutes } from './workplace-routes.js'
import { registerAttachmentRoutes } from './attachment-routes.js'
import { createRealtime } from './realtime.js'
import { ReadCache } from './read-cache.js'
import { registerAccountRoutes } from './account-routes.js'
import { registerUnreadRoutes } from './unread-routes.js'
import { attachments, channelMembers, channelReads, channels, directConversations, invitations, memberships, messages, profiles, sessions, teams, users } from './schema.js'

export class RequestError extends Error {
  constructor(readonly statusCode: number, readonly code: string) {
    super(code)
  }
}

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new RequestError(400, 'INVALID_INPUT')
  return result.data
}

const id = z.uuid()
const messageId = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const email = z.email().max(254).transform((value) => value.toLowerCase())
const inviteInput = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
const digest = (token: string) => createHash('sha256').update(token).digest('hex')
const activeInvitation = (token: string) => and(
  eq(invitations.tokenHash, digest(token)),
  gt(invitations.expiresAt, new Date()),
  isNull(invitations.acceptedAt),
)

export function registerRoutes(app: FastifyInstance, services: Services, config: Config) {
  const { auth, db, pool, realtimePool } = services
  const messageCache = new ReadCache()
  const realtime = createRealtime(pool, (channelId) => messageCache.clear(`${channelId}:`), realtimePool)
  const streams = new Set<() => void>()
  app.addHook('preClose', async () => { for (const close of streams) close(); await realtime.close() })

  async function requireUser(request: FastifyRequest) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
    if (!session) throw new RequestError(401, 'SIGN_IN_REQUIRED')
    return session.user
  }

  const teamAccess = (userId: string) => exists(db.select({ id: memberships.userId })
    .from(memberships).where(and(eq(memberships.teamId, teams.id), eq(memberships.userId, userId))))
  const channelAccess = (userId: string) => or(
    and(eq(channels.visibility, 'team'), exists(db.select({ id: memberships.userId })
      .from(memberships).where(and(eq(memberships.teamId, channels.teamId), eq(memberships.userId, userId))))),
    and(eq(channels.visibility, 'private'), exists(db.select({ id: channelMembers.userId })
      .from(channelMembers).where(and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, userId))))),
  )

  async function requireChannel(channelId: string, userId: string) {
    const [channel] = await db.select().from(channels)
      .where(and(eq(channels.id, channelId), channelAccess(userId),
        or(isNull(channels.teamId), exists(db.select({ id: teams.id }).from(teams)
          .where(and(eq(teams.id, channels.teamId), isNull(teams.deletedAt)))))))
    if (!channel) throw new RequestError(404, 'CHANNEL_NOT_FOUND')
    return channel
  }

  async function requireOwner(teamId: string, userId: string) {
    const [owner] = await db.select({ id: memberships.userId }).from(memberships)
      .where(and(eq(memberships.teamId, teamId), eq(memberships.userId, userId), eq(memberships.role, 'owner'), exists(db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, teamId), isNull(teams.deletedAt))))))
    if (!owner) throw new RequestError(403, 'FORBIDDEN')
  }

  async function requireThread(channelId: string, threadId: number) {
    const [thread] = await db.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.id, threadId), eq(messages.channelId, channelId), isNull(messages.parentId)))
    if (!thread) throw new RequestError(404, 'THREAD_NOT_FOUND')
  }

  registerWorkplaceRoutes(app, { db }, { requireUser, requireOwner })
  registerAttachmentRoutes(app, { db }, config, { requireUser, requireChannel })
  registerAccountRoutes(app, services, config, requireUser)
  registerUnreadRoutes(app, services, realtime, streams, { requireUser, requireChannel, channelAccess })

  app.get('/health/ready', async () => {
    await db.select({ id: users.id }).from(users).limit(1)
    await db.select({ token: invitations.tokenHash }).from(invitations).limit(1)
    await db.select({ id: messages.id, clientId: messages.clientId, editedAt: messages.editedAt, cancelledAt: messages.cancelledAt }).from(messages).limit(1)
    await db.select({ handle: users.handle }).from(users).limit(1)
    await db.select({ id: attachments.id }).from(attachments).limit(1)
    await db.select({ id: directConversations.channelId }).from(directConversations).limit(1)
    await db.select({ id: channelReads.channelId }).from(channelReads).limit(1)
    return { ready: true, emailConfigured: services.emailAvailable }
  })

  const authPaths = ['/api/auth/sign-in/email', '/api/auth/sign-up/email', '/api/auth/sign-out']
  for (const path of authPaths) {
    app.post(path, { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
      let body = request.body ?? {}
      let requestedHandle: string | undefined
      if (path === '/api/auth/sign-up/email') {
        const input = validate(z.object({
          token: inviteInput.shape.token.optional(),
          name: z.string().trim().min(1).max(80),
          handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/),
          email,
          password: z.string().min(8).max(128),
        }), body)
        if (input.token) {
          const [invite] = await db.select({ email: invitations.email }).from(invitations)
            .where(and(activeInvitation(input.token), eq(invitations.email, input.email),
              exists(db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, invitations.teamId), isNull(teams.deletedAt))))))
          if (!invite) throw new RequestError(400, 'INVITE_INVALID')
        }
        requestedHandle = input.handle
        const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.handle, input.handle))
        if (taken) throw new RequestError(409, 'HANDLE_TAKEN')
        body = { name: input.name, handle: input.handle, email: input.email, password: input.password, callbackURL: `${config.WEB_ORIGIN}/#email=verified` }
      }
      const headers = fromNodeHeaders(request.headers)
      headers.delete('content-length')
      headers.set('content-type', 'application/json')
      headers.set('uorqui-client-ip', request.ip)
      const response = await auth.handler(new Request(new URL(path, config.WEB_ORIGIN), {
        method: 'POST', headers, body: JSON.stringify(body),
      }))
      for (const cookie of response.headers.getSetCookie()) reply.header('set-cookie', cookie)
      if (!response.ok) {
        if (requestedHandle) {
          const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.handle, requestedHandle))
          if (taken) throw new RequestError(409, 'HANDLE_TAKEN')
        }
        const code = response.status === 429 ? 'RATE_LIMITED'
          : response.status >= 500 ? 'SERVER_ERROR'
          : path.endsWith('sign-in/email') ? 'SIGN_IN_FAILED' : 'AUTH_FAILED'
        return reply.code(response.status).send({ code })
      }
      return reply.code(response.status).type('application/json').send(await response.text())
    })
  }

  app.get('/api/session', async (request) => {
    const user = await requireUser(request)
    const [fresh] = await db.select({ id: users.id, name: users.name, email: users.email, emailVerified: users.emailVerified, handle: users.handle, bio: profiles.bio })
      .from(users).leftJoin(profiles, eq(users.id, profiles.userId)).where(eq(users.id, user.id))
    return fresh
  })

  app.get('/api/teams', async (request) => {
    const { id: userId } = await requireUser(request)
    const hasChannel = exists(db.select({ id: channels.id }).from(channels)
      .where(and(eq(channels.teamId, teams.id), channelAccess(userId))))
    return db.select({ id: teams.id, name: teams.name, role: memberships.role })
      .from(teams)
      .leftJoin(memberships, and(eq(teams.id, memberships.teamId), eq(memberships.userId, userId)))
      .where(and(isNull(teams.deletedAt), or(teamAccess(userId), hasChannel)))
      .orderBy(asc(teams.name), asc(teams.id))
  })

  app.post('/api/teams', async (request, reply) => {
    const { id: userId } = await requireUser(request)
    const { name } = validate(z.object({ name: z.string().trim().min(2).max(80) }), request.body)
    const team = await db.transaction(async (tx) => {
      const [created] = await tx.insert(teams).values({ name }).returning({ id: teams.id, name: teams.name })
      if (!created) throw new Error('Team insert returned no row')
      await tx.insert(memberships).values({ teamId: created.id, userId, role: 'owner' })
      await tx.insert(channels).values({ teamId: created.id, name: 'general', visibility: 'team' })
      return { ...created, role: 'owner' }
    })
    return reply.code(201).send(team)
  })

  app.get('/api/teams/:teamId/channels', async (request) => {
    const { id: userId } = await requireUser(request)
    const { teamId } = validate(z.object({ teamId: id }), request.params)
    return db.select({ id: channels.id, name: channels.name, description: channels.description, visibility: channels.visibility })
      .from(channels).where(and(eq(channels.teamId, teamId), channelAccess(userId),
        exists(db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, teamId), isNull(teams.deletedAt))))))
      .orderBy(asc(channels.createdAt), asc(channels.id))
  })

  app.post('/api/teams/:teamId/channels', async (request, reply) => {
    const { id: userId } = await requireUser(request)
    const { teamId } = validate(z.object({ teamId: id }), request.params)
    await requireOwner(teamId, userId)
    const input = validate(z.object({
      name: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,39}$/),
      description: z.string().trim().max(180),
      visibility: z.enum(['team', 'private']),
    }), request.body)
    const channel = await db.transaction(async (tx) => {
      const [created] = await tx.insert(channels).values({ ...input, teamId })
        .onConflictDoNothing({ target: [channels.teamId, channels.name] }).returning()
      if (!created) throw new RequestError(409, 'CHANNEL_NAME_TAKEN')
      if (created.visibility === 'private') {
        await tx.insert(channelMembers).values({ channelId: created.id, userId })
      }
      return created
    })
    return reply.code(201).send(channel)
  })

  app.post('/api/teams/:teamId/invitations', async (request, reply) => {
    const { id: userId } = await requireUser(request)
    const { teamId } = validate(z.object({ teamId: id }), request.params)
    await requireOwner(teamId, userId)
    const input = validate(z.object({ email, channelId: id.optional() }), request.body)
    if (input.channelId) {
      const channel = await requireChannel(input.channelId, userId)
      if (channel.teamId !== teamId || channel.visibility !== 'private') {
        throw new RequestError(400, 'INVALID_INPUT')
      }
    }
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)
    await db.insert(invitations).values({ ...input, teamId, tokenHash: digest(token), expiresAt })
    return reply.code(201).send({ url: `${config.WEB_ORIGIN}/#invite=${token}`, expiresAt })
  })

  app.post('/api/invitations/accept', async (request) => {
    const user = await requireUser(request)
    const { token } = validate(inviteInput, request.body)
    return db.transaction(async (tx) => {
      const [invite] = await tx.select().from(invitations)
        .where(eq(invitations.tokenHash, digest(token))).for('update')
      if (!invite || invite.email !== user.email) throw new RequestError(400, 'INVITE_INVALID')
      const [activeTeam] = await tx.select({ id: teams.id }).from(teams).where(and(eq(teams.id, invite.teamId), isNull(teams.deletedAt)))
      if (!activeTeam) throw new RequestError(400, 'INVITE_INVALID')
      if (invite.acceptedAt) return { teamId: invite.teamId, channelId: invite.channelId }
      if (invite.expiresAt <= new Date()) throw new RequestError(400, 'INVITE_INVALID')
      if (invite.channelId) {
        await tx.insert(channelMembers).values({ channelId: invite.channelId, userId: user.id }).onConflictDoNothing()
      } else {
        await tx.insert(memberships).values({ teamId: invite.teamId, userId: user.id, role: 'member' }).onConflictDoNothing()
      }
      await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.tokenHash, invite.tokenHash))
      return { teamId: invite.teamId, channelId: invite.channelId }
    })
  })

  app.get('/api/channels/:channelId/events', async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
    if (!session) throw new RequestError(401, 'SIGN_IN_REQUIRED')
    const user = session.user
    const { channelId } = validate(z.object({ channelId: id }), request.params)
    await requireChannel(channelId, user.id)
    reply.hijack()
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' })
    reply.raw.flushHeaders()
    let closed = false
    let checking = false
    let queued = false
    let beats = 0
    const close = () => {
      if (closed) return
      closed = true; clearInterval(heartbeat); unsubscribe(); streams.delete(close); reply.raw.end()
    }
    const send = (event: string, data: unknown = {}) => {
      if (!closed && !reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) close()
    }
    const refresh = async () => {
      if (closed) return
      if (checking) { queued = true; return }
      checking = true
      try {
        const [active] = await db.select({ id: sessions.id }).from(sessions)
          .where(and(eq(sessions.id, session.session.id), eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())))
        if (!active) throw new RequestError(401, 'SIGN_IN_REQUIRED')
        await requireChannel(channelId, user.id)
        send('messages')
      } catch (error) {
        if (error instanceof RequestError && [401, 403, 404].includes(error.statusCode)) send('access-revoked', { code: error.code })
        else request.log.warn({ code: (error as { code?: string }).code }, 'Realtime access check failed temporarily')
        close()
      }
      finally { checking = false; if (queued) { queued = false; void refresh() } }
    }
    const unsubscribe = realtime.subscribe(channelId, () => void refresh())
    const heartbeat = setInterval(() => {
      if (++beats % 3 === 0) void refresh()
      else if (!closed) reply.raw.write(': heartbeat\n\n')
    }, 20_000)
    streams.add(close)
    reply.raw.once('close', close)
    send('ready')
    return reply
  })

  app.get('/api/channels/:channelId/messages', async (request) => {
    const { id: userId } = await requireUser(request)
    const { channelId } = validate(z.object({ channelId: id }), request.params)
    const { thread, before } = validate(z.object({ thread: messageId.optional(), before: messageId.optional() }), request.query)
    await requireChannel(channelId, userId)
    if (thread) await requireThread(channelId, thread)
    return messageCache.read(`${channelId}:${thread ?? ''}:${before ?? ''}`, async () => {
      const roots = db.select({
        id: messages.id, body: messages.body, location: messages.location, createdAt: messages.createdAt,
        authorId: messages.authorId, clientId: messages.clientId, editedAt: messages.editedAt, cancelledAt: messages.cancelledAt,
        author: users.name,
      }).from(messages).innerJoin(users, eq(messages.authorId, users.id))
        .where(and(eq(messages.channelId, channelId),
          thread ? eq(messages.parentId, thread) : isNull(messages.parentId),
          before ? lt(messages.id, before) : undefined))
        .orderBy(desc(messages.id)).limit(51).as('page')

      const rows = await db.select({
        id: roots.id, body: roots.body, location: roots.location, createdAt: roots.createdAt, author: roots.author,
        authorId: roots.authorId, clientId: roots.clientId, editedAt: roots.editedAt, cancelledAt: roots.cancelledAt,
        readCursor: sql<number>`cast((select coalesce(max(id), 0) from ${messages} where channel_id = ${channelId}) as bigint)`.mapWith(Number),
        replies: thread ? sql<number>`0` : sql<number>`cast((
          select count(*) from ${messages} as reply
          where reply.channel_id = ${channelId} and reply.parent_id = "page"."id"
        ) as integer)`,
      }).from(roots).orderBy(desc(roots.id))

      const page = rows.slice(0, 50).reverse()
      const files = page.length ? await db.select({ id: attachments.id, name: attachments.name, mime: attachments.mime,
        size: attachments.size, messageId: attachments.messageId }).from(attachments)
        .where(inArray(attachments.messageId, page.filter((row) => !row.cancelledAt).map((row) => row.id))) : []
      return { readCursor: rows[0]?.readCursor ?? 0, messages: page.map(({ readCursor: _, ...row }) => ({ ...row, attachments: files.filter((file) => file.messageId === row.id)
        .map(({ messageId: _, ...file }) => file) })), more: rows.length > 50 }
    })
  })

  app.post('/api/channels/:channelId/messages', async (request, reply) => {
    const { id: userId } = await requireUser(request)
    const { channelId } = validate(z.object({ channelId: id }), request.params)
    const input = validate(z.object({
      body: z.string().trim().max(4000).default(''),
      thread: messageId.optional(), clientId: id.optional(),
      attachmentIds: z.array(id).max(10).default([]),
      location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(),
    }).refine((value) => !!value.body || value.attachmentIds.length > 0 || !!value.location), request.body)
    const { body, thread, clientId, attachmentIds, location } = input
    await requireChannel(channelId, userId)
    if (thread) await requireThread(channelId, thread)
    const message = await db.transaction(async (tx) => {
      if (clientId) {
        const [existing] = await tx.select({ id: messages.id, channelId: messages.channelId }).from(messages)
          .where(and(eq(messages.authorId, userId), eq(messages.clientId, clientId)))
        if (existing) {
          if (existing.channelId !== channelId) throw new RequestError(409, 'INVALID_INPUT')
          return existing
        }
      }
      if (attachmentIds.length) {
        const files = await tx.select().from(attachments).where(inArray(attachments.id, attachmentIds)).for('update')
        if (files.length !== new Set(attachmentIds).size || files.some((file) => file.authorId !== userId || file.channelId !== channelId || !file.ready || file.messageId !== null))
          throw new RequestError(400, 'INVALID_FILE')
      }
      let [created] = await tx.insert(messages).values({ channelId, authorId: userId, body, parentId: thread, clientId, location })
        .onConflictDoNothing({ target: [messages.authorId, messages.clientId] }).returning({ id: messages.id })
      if (!created && clientId) [created] = await tx.select({ id: messages.id }).from(messages)
        .where(and(eq(messages.authorId, userId), eq(messages.clientId, clientId), eq(messages.channelId, channelId)))
      if (!created) throw new RequestError(409, 'INVALID_INPUT')
      if (attachmentIds.length) await tx.update(attachments).set({ messageId: created.id }).where(inArray(attachments.id, attachmentIds))
      return created
    })
    await realtime.publish(channelId)
    return reply.code(201).send(message)
  })

  app.post('/api/channels/:channelId/messages/:messageId/edit', async (request) => {
    const user = await requireUser(request)
    const params = validate(z.object({ channelId: id, messageId }), request.params)
    const { body } = validate(z.object({ body: z.string().trim().min(1).max(4000) }), request.body)
    await requireChannel(params.channelId, user.id)
    const [updated] = await db.update(messages).set({ body, editedAt: new Date() })
      .where(and(eq(messages.id, params.messageId), eq(messages.channelId, params.channelId),
        eq(messages.authorId, user.id), isNull(messages.cancelledAt))).returning({ id: messages.id })
    if (!updated) throw new RequestError(404, 'MESSAGE_UNAVAILABLE')
    await realtime.publish(params.channelId)
    return updated
  })

  app.post('/api/channels/:channelId/messages/:messageId/cancel', async (request) => {
    const user = await requireUser(request)
    const params = validate(z.object({ channelId: id, messageId }), request.params)
    await requireChannel(params.channelId, user.id)
    const [updated] = await db.update(messages).set({ body: '', location: null, cancelledAt: new Date() })
      .where(and(eq(messages.id, params.messageId), eq(messages.channelId, params.channelId),
        eq(messages.authorId, user.id))).returning({ id: messages.id })
    if (!updated) throw new RequestError(404, 'MESSAGE_UNAVAILABLE')
    await realtime.publish(params.channelId)
    return updated
  })
}
