import { createHash, randomBytes } from 'node:crypto'
import { fromNodeHeaders } from 'better-auth/node'
import { and, asc, desc, eq, exists, gt, isNull, lt, or, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Config } from './config.js'
import type { Services } from './database.js'
import { channelMembers, channels, invitations, memberships, messages, teams, users } from './schema.js'

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

export function registerRoutes(app: FastifyInstance, { auth, db }: Services, config: Config) {
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
      .where(and(eq(channels.id, channelId), channelAccess(userId)))
    if (!channel) throw new RequestError(404, 'CHANNEL_NOT_FOUND')
    return channel
  }

  async function requireOwner(teamId: string, userId: string) {
    const [owner] = await db.select({ id: memberships.userId }).from(memberships)
      .where(and(eq(memberships.teamId, teamId), eq(memberships.userId, userId), eq(memberships.role, 'owner')))
    if (!owner) throw new RequestError(403, 'FORBIDDEN')
  }

  async function requireThread(channelId: string, threadId: number) {
    const [thread] = await db.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.id, threadId), eq(messages.channelId, channelId), isNull(messages.parentId)))
    if (!thread) throw new RequestError(404, 'THREAD_NOT_FOUND')
  }

  app.get('/health/ready', async () => {
    await db.select({ id: users.id }).from(users).limit(1)
    await db.select({ token: invitations.tokenHash }).from(invitations).limit(1)
    return { ready: true }
  })

  const authPaths = ['/api/auth/sign-in/email', '/api/auth/sign-up/email', '/api/auth/sign-out']
  for (const path of authPaths) {
    app.post(path, { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
      let body = request.body ?? {}
      if (path === '/api/auth/sign-up/email') {
        const input = validate(inviteInput.extend({
          name: z.string().trim().min(1).max(80),
          email,
          password: z.string().min(8).max(128),
        }), body)
        const [invite] = await db.select({ email: invitations.email }).from(invitations)
          .where(and(activeInvitation(input.token), eq(invitations.email, input.email)))
        if (!invite) throw new RequestError(400, 'INVITE_INVALID')
        body = { name: input.name, email: input.email, password: input.password }
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
    return { id: user.id, name: user.name, email: user.email }
  })

  app.get('/api/teams', async (request) => {
    const { id: userId } = await requireUser(request)
    const hasChannel = exists(db.select({ id: channels.id }).from(channels)
      .where(and(eq(channels.teamId, teams.id), channelAccess(userId))))
    return db.select({ id: teams.id, name: teams.name, role: memberships.role })
      .from(teams)
      .leftJoin(memberships, and(eq(teams.id, memberships.teamId), eq(memberships.userId, userId)))
      .where(or(teamAccess(userId), hasChannel))
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
      .from(channels).where(and(eq(channels.teamId, teamId), channelAccess(userId)))
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

  app.get('/api/channels/:channelId/messages', async (request) => {
    const { id: userId } = await requireUser(request)
    const { channelId } = validate(z.object({ channelId: id }), request.params)
    const { thread, before } = validate(z.object({ thread: messageId.optional(), before: messageId.optional() }), request.query)
    await requireChannel(channelId, userId)
    if (thread) await requireThread(channelId, thread)
    const roots = db.select({
      id: messages.id, body: messages.body, createdAt: messages.createdAt,
      author: users.name,
    }).from(messages).innerJoin(users, eq(messages.authorId, users.id))
      .where(and(eq(messages.channelId, channelId),
        thread ? eq(messages.parentId, thread) : isNull(messages.parentId),
        before ? lt(messages.id, before) : undefined))
      .orderBy(desc(messages.id)).limit(51).as('page')

    const rows = await db.select({
      id: roots.id, body: roots.body, createdAt: roots.createdAt, author: roots.author,
      replies: thread ? sql<number>`0` : sql<number>`cast((
        select count(*) from ${messages} as reply
        where reply.channel_id = ${channelId} and reply.parent_id = "page"."id"
      ) as integer)`,
    }).from(roots).orderBy(desc(roots.id))

    return { messages: rows.slice(0, 50).reverse(), more: rows.length > 50 }
  })

  app.post('/api/channels/:channelId/messages', async (request, reply) => {
    const { id: userId } = await requireUser(request)
    const { channelId } = validate(z.object({ channelId: id }), request.params)
    const { body, thread } = validate(z.object({
      body: z.string().trim().min(1).max(4000),
      thread: messageId.optional(),
    }), request.body)
    await requireChannel(channelId, userId)
    if (thread) await requireThread(channelId, thread)
    const [message] = await db.insert(messages).values({ channelId, authorId: userId, body, parentId: thread })
      .returning({ id: messages.id })
    return reply.code(201).send(message)
  })
}
