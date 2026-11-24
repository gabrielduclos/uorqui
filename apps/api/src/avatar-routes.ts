import { timingSafeEqual } from 'node:crypto'
import { and, eq, exists, isNull, or } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Config } from './config.js'
import type { Services } from './database.js'
import { avatarUploads, channelMembers, channels, memberships, teams, users } from './schema.js'
import { RequestError } from './routes.js'

export function registerAvatarRoutes(app: FastifyInstance, { db }: Services, config: Config, access: {
  requireUser: (request: FastifyRequest) => Promise<{ id: string }>
  requireOwner: (teamId: string, userId: string) => Promise<void>
  invalidate: () => void
}) {
  app.post('/api/avatars/uploads', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const user = await access.requireUser(request)
    const parsed = z.object({ id: z.uuid(), teamId: z.uuid().optional(), mime: z.enum(['image/jpeg', 'image/png', 'image/webp']), size: z.number().int().min(1).max(1024 * 1024) }).safeParse(request.body)
    if (!parsed.success) throw new RequestError(400, 'INVALID_FILE')
    if (parsed.data.teamId) await access.requireOwner(parsed.data.teamId, user.id)
    if (!config.FILES_SECRET) throw new RequestError(503, 'FILES_UNAVAILABLE')
    const [file] = await db.insert(avatarUploads).values({ ...parsed.data, userId: user.id }).returning()
    return { id: file!.id }
  })
  app.post('/api/avatars/remove', async (request) => {
    const user = await access.requireUser(request)
    const parsed = z.object({ teamId: z.uuid().optional() }).safeParse(request.body)
    if (!parsed.success) throw new RequestError(400, 'INVALID_INPUT')
    if (parsed.data.teamId) {
      await access.requireOwner(parsed.data.teamId, user.id)
      await db.update(teams).set({ image: null }).where(eq(teams.id, parsed.data.teamId))
    } else await db.update(users).set({ image: null, updatedAt: new Date() }).where(eq(users.id, user.id))
    access.invalidate()
    return { removed: true }
  })
  async function check(request: FastifyRequest) {
    const secret = request.headers['x-files-secret']
    if (!config.FILES_SECRET || typeof secret !== 'string' || Buffer.byteLength(secret) !== Buffer.byteLength(config.FILES_SECRET) || !timingSafeEqual(Buffer.from(secret), Buffer.from(config.FILES_SECRET))) throw new RequestError(403, 'FORBIDDEN')
    const parsed = z.object({ avatarId: z.uuid() }).safeParse(request.params)
    if (!parsed.success) throw new RequestError(400, 'INVALID_FILE')
    const [file] = await db.select().from(avatarUploads).where(eq(avatarUploads.id, parsed.data.avatarId))
    if (!file) throw new RequestError(404, 'FILE_NOT_FOUND')
    return file
  }
  async function authorizeUpload(request: FastifyRequest, file: typeof avatarUploads.$inferSelect) {
    const user = await access.requireUser(request)
    if (file.userId !== user.id || file.ready || file.createdAt < new Date(Date.now() - 3600_000)) throw new RequestError(403, 'FORBIDDEN')
    if (file.teamId) await access.requireOwner(file.teamId, user.id)
  }
  app.get('/api/internal/avatars/:avatarId', async (request) => {
    const file = await check(request)
    const url = `/api/avatars/${file.id}`
    if ((request.query as { upload?: string }).upload === '1') await authorizeUpload(request, file)
    else {
      if (!file.ready) throw new RequestError(404, 'FILE_NOT_FOUND')
      if (file.teamId) {
        const user = await access.requireUser(request)
        const [team] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, file.teamId), eq(teams.image, url), isNull(teams.deletedAt), or(
          exists(db.select().from(memberships).where(and(eq(memberships.teamId, teams.id), eq(memberships.userId, user.id)))),
          exists(db.select().from(channels).innerJoin(channelMembers, eq(channelMembers.channelId, channels.id)).where(and(eq(channels.teamId, teams.id), eq(channelMembers.userId, user.id)))))))
        if (!team) throw new RequestError(404, 'FILE_NOT_FOUND')
      } else {
        const [user] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, file.userId), eq(users.image, url)))
        if (!user) throw new RequestError(404, 'FILE_NOT_FOUND')
      }
    }
    return { id: file.id, name: 'avatar', mime: file.mime, size: file.size, key: `avatars/${file.id}`, ready: file.ready }
  })
  app.post('/api/internal/avatars/:avatarId/complete', async (request) => {
    const file = await check(request)
    await authorizeUpload(request, file)
    await db.transaction(async (tx) => {
      await tx.update(avatarUploads).set({ ready: true }).where(eq(avatarUploads.id, file.id))
      const image = `/api/avatars/${file.id}`
      if (file.teamId) await tx.update(teams).set({ image }).where(eq(teams.id, file.teamId))
      else await tx.update(users).set({ image, updatedAt: new Date() }).where(eq(users.id, file.userId))
    })
    access.invalidate()
    return { ready: true }
  })
}
