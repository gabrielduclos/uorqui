import rateLimit from '@fastify/rate-limit'
import Fastify, { LogController } from 'fastify'
import type { Config } from './config.js'
import { connect } from './database.js'
import { registerRoutes, RequestError } from './routes.js'

export async function createApp(config: Config, logger = true) {
  const app = Fastify({ logger, logController: new LogController({ disableRequestLogging: true }), bodyLimit: 32 * 1024 })
  const services = connect(config)

  app.addHook('onClose', async () => { await services.realtimePool.end(); await services.pool.end() })
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store')
    if (request.method === 'POST' && request.headers.origin !== config.WEB_ORIGIN) {
      throw new RequestError(403, 'FORBIDDEN')
    }
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof RequestError) return reply.code(error.statusCode).send({ code: error.code })
    const failure = error as { statusCode?: number; code?: string; cause?: { code?: string } }
    if (failure.statusCode === 429) return reply.code(429).send({ code: 'RATE_LIMITED' })
    if (failure.statusCode && failure.statusCode < 500) {
      return reply.code(failure.statusCode).send({ code: 'INVALID_INPUT' })
    }
    request.log.error({ route: request.routeOptions.url, code: failure.cause?.code ?? failure.code }, 'Request failed')
    return reply.code(500).send({ code: 'SERVER_ERROR' })
  })

  await app.register(rateLimit, { global: false })
  registerRoutes(app, services, config)
  return app
}
