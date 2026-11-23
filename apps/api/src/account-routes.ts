import { fromNodeHeaders } from 'better-auth/node'
import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Config } from './config.js'
import type { Services } from './database.js'
import { RequestError } from './routes.js'

export function registerAccountRoutes(app: FastifyInstance, { auth, emailAvailable }: Services, config: Config,
  requireUser: (request: FastifyRequest) => Promise<{ email: string; emailVerified: boolean }>) {
  const keyGenerator = (request: FastifyRequest) => createHash('sha256').update(request.headers.cookie ?? request.ip).digest('hex')
  app.post('/api/account/verification', { config: { rateLimit: { max: 3, timeWindow: '1 minute', keyGenerator } } }, async (request) => {
    const user = await requireUser(request)
    if (user.emailVerified) return { sent: false, verified: true }
    if (!emailAvailable) throw new RequestError(503, 'EMAIL_UNAVAILABLE')
    try {
      const headers = fromNodeHeaders(request.headers)
      headers.set('uorqui-client-ip', request.ip)
      await auth.api.sendVerificationEmail({ headers, body: {
        email: user.email, callbackURL: `${config.WEB_ORIGIN}/#email=verified`,
      } })
    } catch { throw new RequestError(503, 'EMAIL_UNAVAILABLE') }
    return { sent: true }
  })

  app.get('/api/auth/verify-email', async (request, reply) => {
    const parsed = z.object({ token: z.string().min(1).max(4096) }).safeParse(request.query)
    if (!parsed.success) return reply.redirect(`${config.WEB_ORIGIN}/#email=invalid`)
    // Callback is fixed here, including when a caller tampers with the email URL.
    const url = new URL('/api/auth/verify-email', config.WEB_ORIGIN)
    url.searchParams.set('token', parsed.data.token)
    const response = await auth.handler(new Request(url, { headers: fromNodeHeaders(request.headers) }))
    for (const cookie of response.headers.getSetCookie()) reply.header('set-cookie', cookie)
    return reply.redirect(`${config.WEB_ORIGIN}/#email=${response.ok ? 'verified' : 'invalid'}`)
  })

  app.post('/api/account/password', { config: { rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator } } }, async (request, reply) => {
    await requireUser(request)
    const parsed = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(8).max(128) }).safeParse(request.body)
    if (!parsed.success) throw new RequestError(400, 'INVALID_INPUT')
    const headers = fromNodeHeaders(request.headers)
    headers.delete('content-length')
    headers.set('content-type', 'application/json')
    headers.set('uorqui-client-ip', request.ip)
    const response = await auth.handler(new Request(new URL('/api/auth/change-password', config.WEB_ORIGIN), {
      method: 'POST', headers, body: JSON.stringify({ ...parsed.data, revokeOtherSessions: true }),
    }))
    for (const cookie of response.headers.getSetCookie()) reply.header('set-cookie', cookie)
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { code?: string } | null
      throw new RequestError(response.status, body?.code === 'INVALID_PASSWORD' ? 'CURRENT_PASSWORD_INVALID'
        : response.status === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR')
    }
    // Never expose the fresh session token returned internally by Better Auth.
    return { changed: true }
  })
}
