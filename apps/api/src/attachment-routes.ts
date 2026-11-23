import { timingSafeEqual } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Config } from './config.js'
import type { Services } from './database.js'
import { RequestError } from './routes.js'
import { attachments, messages } from './schema.js'

const mimes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf', 'text/plain', 'application/zip', 'application/octet-stream',
  'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])

export function registerAttachmentRoutes(app: FastifyInstance, { db }: Pick<Services, 'db'>, config: Config, access: {
  requireUser: (request: FastifyRequest) => Promise<{ id: string }>
  requireChannel: (channelId: string, userId: string) => Promise<unknown>
}) {
  app.post('/api/channels/:channelId/uploads', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request) => {
    const user = await access.requireUser(request)
    const params = z.object({ channelId: z.uuid() }).safeParse(request.params)
    const input = z.object({ id: z.uuid(), name: z.string().min(1).max(180).regex(/^[^\\/\r\n\u0000-\u001f]+$/),
      mime: z.string().refine((value) => mimes.has(value)), size: z.number().int().min(1).max(50 * 1024 * 1024) }).safeParse(request.body)
    if (!params.success || !input.success) throw new RequestError(400, 'INVALID_FILE')
    await access.requireChannel(params.data.channelId, user.id)
    if (!config.FILES_SECRET) throw new RequestError(503, 'FILES_UNAVAILABLE')
    const [row] = await db.insert(attachments).values({ ...input.data, authorId: user.id, channelId: params.data.channelId })
      .onConflictDoNothing().returning()
    const existing = row ?? (await db.select().from(attachments).where(eq(attachments.id, input.data.id)))[0]
    if (!existing || existing.authorId !== user.id || existing.channelId !== params.data.channelId ||
      existing.name !== input.data.name || existing.size !== input.data.size || existing.mime !== input.data.mime) throw new RequestError(409, 'INVALID_FILE')
    return { id: existing.id, ready: existing.ready }
  })

  const check = async (request: FastifyRequest) => {
    const secret = request.headers['x-files-secret']
    if (!config.FILES_SECRET || typeof secret !== 'string' || Buffer.byteLength(secret) !== Buffer.byteLength(config.FILES_SECRET) ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(config.FILES_SECRET))) throw new RequestError(403, 'FORBIDDEN')
    const user = await access.requireUser(request)
    const params = z.object({ attachmentId: z.uuid() }).safeParse(request.params)
    if (!params.success) throw new RequestError(400, 'INVALID_FILE')
    const [file] = await db.select().from(attachments).where(eq(attachments.id, params.data.attachmentId))
    if (!file) throw new RequestError(404, 'FILE_NOT_FOUND')
    await access.requireChannel(file.channelId, user.id)
    return { user, file }
  }
  app.get('/api/internal/files/:attachmentId', async (request) => {
    const { user, file } = await check(request)
    const upload = (request.query as { upload?: string }).upload === '1'
    if (upload) {
      if (file.authorId !== user.id || file.messageId !== null || file.createdAt < new Date(Date.now() - 24 * 60 * 60_000)) throw new RequestError(403, 'FORBIDDEN')
    } else {
      if (!file.ready || file.messageId === null) throw new RequestError(404, 'FILE_NOT_FOUND')
      const [message] = await db.select({ id: messages.id }).from(messages)
        .where(and(eq(messages.id, file.messageId), isNull(messages.cancelledAt)))
      if (!message) throw new RequestError(404, 'FILE_NOT_FOUND')
    }
    return { id: file.id, name: file.name, mime: file.mime, size: file.size, key: `attachments/${file.id}`, ready: file.ready }
  })
  app.post('/api/internal/files/:attachmentId/complete', async (request) => {
    const { user, file } = await check(request)
    if (file.authorId !== user.id) throw new RequestError(403, 'FORBIDDEN')
    await db.update(attachments).set({ ready: true }).where(eq(attachments.id, file.id))
    return { ready: true }
  })
}
