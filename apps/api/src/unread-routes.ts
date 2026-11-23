import { fromNodeHeaders } from 'better-auth/node'
import { and, eq, exists, gt, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Services } from './database.js'
import type { createRealtime } from './realtime.js'
import { RequestError } from './routes.js'
import { channelReads, channels, messages, sessions, teams } from './schema.js'

export function registerUnreadRoutes(app: FastifyInstance, { db, auth }: Services, realtime: ReturnType<typeof createRealtime>, streams: Set<() => void>,
  access: { requireUser: (request: FastifyRequest) => Promise<{ id: string }>;
    requireChannel: (channelId: string, userId: string) => Promise<{ teamId: string | null }>; channelAccess: (userId: string) => SQL | undefined }) {
  app.get('/api/unread', async (request) => {
    const user = await access.requireUser(request)
    return db.select({ channelId: channels.id, teamId: channels.teamId,
      count: sql<number>`cast(count(${messages.id}) as integer)`,
      latestId: sql<number>`cast(coalesce(max(${messages.id}), 0) as bigint)`.mapWith(Number),
    }).from(channels)
      .leftJoin(channelReads, and(eq(channelReads.channelId, channels.id), eq(channelReads.userId, user.id)))
      .innerJoin(messages, and(eq(messages.channelId, channels.id),
        sql`${messages.id} > coalesce(${channelReads.lastMessageId}, 0)`,
        sql`${messages.authorId} <> ${user.id}`, isNull(messages.cancelledAt)))
      .where(and(access.channelAccess(user.id), or(isNull(channels.teamId), exists(db.select({ id: teams.id }).from(teams)
        .where(and(eq(teams.id, channels.teamId), isNull(teams.deletedAt)))))))
      .groupBy(channels.id, channels.teamId)
  })

  app.post('/api/channels/:channelId/read', async (request) => {
    const user = await access.requireUser(request)
    const params = z.object({ channelId: z.uuid() }).safeParse(request.params)
    const input = z.object({ lastMessageId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).safeParse(request.body)
    if (!params.success || !input.success) throw new RequestError(400, 'INVALID_INPUT')
    const { channelId } = params.data
    await access.requireChannel(channelId, user.id)
    const [message] = await db.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.channelId, channelId), eq(messages.id, input.data.lastMessageId)))
    if (!message) throw new RequestError(400, 'INVALID_INPUT')
    await db.insert(channelReads).values({ userId: user.id, channelId, lastMessageId: message.id })
      .onConflictDoUpdate({ target: [channelReads.userId, channelReads.channelId],
        set: { lastMessageId: sql`greatest(${channelReads.lastMessageId}, ${message.id})` } })
    await realtime.publish(channelId)
    return { read: true }
  })

  app.get('/api/inbox/events', async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
    if (!session) throw new RequestError(401, 'SIGN_IN_REQUIRED')
    reply.hijack()
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    reply.raw.flushHeaders()
    let closed = false
    let pending = false
    let queued = false
    let directChanged = false
    const close = () => {
      if (closed) return
      closed = true; clearInterval(heartbeat); unsubscribe(); streams.delete(close); reply.raw.end()
    }
    const send = (event: string, data = {}) => { if (!closed && !reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) close() }
    const refresh = async (direct = false) => {
      if (closed) return
      directChanged ||= direct
      if (pending) { queued = true; return }
      pending = true
      try {
        const [active] = await db.select({ id: sessions.id }).from(sessions)
          .where(and(eq(sessions.id, session.session.id), gt(sessions.expiresAt, new Date())))
        if (!active) { send('access-revoked'); close(); return }
        send('unread', { direct: directChanged })
        directChanged = false
      } catch { close() }
      finally { pending = false; if (queued) { queued = false; void refresh() } }
    }
    const unsubscribe = realtime.subscribe('*', (channelId) => {
      if (!channelId) { void refresh(true); return }
      void access.requireChannel(channelId, session.user.id).then((channel) => refresh(channel.teamId === null))
        .catch(() => { /* No event for inaccessible channels. */ })
    })
    const heartbeat = setInterval(() => void refresh(), 60_000)
    streams.add(close)
    reply.raw.once('close', close)
    send('ready')
    return reply
  })
}
