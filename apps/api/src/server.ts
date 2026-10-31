import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fromNodeHeaders } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import { getAuth } from './auth/auth.js';
import { createDatabase, closeDatabase, getPool } from './db/client.js';
import { profiles, users } from './db/schema.js';

const app = Fastify({
  logger: {
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
  },
  bodyLimit: 64 * 1024,
});

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});

app.get('/health', async () => ({
  ok: true,
  service: 'uorqui-api',
  database: 'not_checked',
}));

app.get('/health/db', async (_request, reply) => {
  if (!process.env.DATABASE_URL) {
    return reply.status(503).send({ ok: false, database: 'not_configured' });
  }
  try {
    await getPool().query('SELECT 1');
    return { ok: true, database: 'connected' };
  } catch (error) {
    app.log.error({ err: error }, 'Database health check failed');
    return reply.status(503).send({ ok: false, database: 'unavailable' });
  }
});

app.get('/api/v1/status', async () => ({
  project: 'uorqui',
  stage: 'auth-development',
  featuresEnabled: ['auth-scaffold'],
  publicRegistration: false,
}));

// Better Auth uses Fetch API Request/Response semantics; Fastify handles the network.
app.route({
  method: ['GET', 'POST'],
  url: '/api/auth/*',
  async handler(request, reply) {
    if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET) {
      return reply.status(503).send({ error: 'Authentication not configured' });
    }
    try {
      const url = new URL(request.raw.url ?? request.url, process.env.AUTH_BASE_URL ?? 'http://localhost:3001');
      const headers = fromNodeHeaders(request.headers);
      const authRequest = new Request(url, {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      const response = await getAuth().handler(authRequest);

      reply.status(response.status);
      for (const [name, value] of response.headers) {
        if (name.toLowerCase() !== 'set-cookie') reply.header(name, value);
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);
      return reply.send(await response.text());
    } catch (error) {
      request.log.error({ err: error }, 'Auth request failed');
      return reply.status(500).send({ error: 'Authentication unavailable' });
    }
  },
});

async function readSession(request: { headers: Record<string, unknown> }) {
  if (!process.env.AUTH_SECRET || !process.env.DATABASE_URL) return null;
  return getAuth().api.getSession({ headers: fromNodeHeaders(request.headers as Parameters<typeof fromNodeHeaders>[0]) });
}

app.get('/api/v1/me', async (request, reply) => {
  try {
    const session = await readSession(request);
    if (!session) return reply.status(401).send({ error: 'Unauthorized' });

    const existing = await createDatabase()
      .select({
        handle: users.handle,
        displayName: profiles.displayName,
        bio: profiles.bio,
      })
      .from(users)
      .leftJoin(profiles, eq(users.id, profiles.userId))
      .where(eq(users.id, session.user.id))
      .limit(1);

    return {
      user: { id: session.user.id, name: session.user.name, email: session.user.email },
      profile: existing[0] ?? null,
    };
  } catch (error) {
    request.log.error({ err: error }, 'Get profile failed');
    return reply.status(503).send({ error: 'Service unavailable' });
  }
});

app.post('/api/v1/onboarding', {
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['handle', 'displayName'],
      properties: {
        handle: { type: 'string', pattern: '^[a-z][a-z0-9_]{2,31}$', minLength: 3, maxLength: 32 },
        displayName: { type: 'string', minLength: 2, maxLength: 120 },
      },
    },
  },
}, async (request, reply) => {
  let session: Awaited<ReturnType<typeof readSession>>;
  try {
    session = await readSession(request);
  } catch (error) {
    request.log.error({ err: error }, 'Session validation failed');
    return reply.status(503).send({ error: 'Service unavailable' });
  }
  if (!session) return reply.status(401).send({ error: 'Unauthorized' });

  const { handle, displayName } = request.body as { handle: string; displayName: string };
  const forbidden = new Set(['admin', 'support', 'uorqui', 'system', 'moderator', 'root']);
  if (forbidden.has(handle)) return reply.status(400).send({ error: 'Handle unavailable' });
  if (!displayName.trim()) return reply.status(400).send({ error: 'Invalid display name' });

  try {
    await createDatabase().transaction(async (tx) => {
      const [record] = await tx.select({ id: users.id }).from(users).where(eq(users.id, session!.user.id)).limit(1);
      if (record) throw new Error('PROFILE_EXISTS');

      await tx.insert(users).values({ id: session!.user.id, handle });
      await tx.insert(profiles).values({ userId: session!.user.id, displayName: displayName.trim() });
    });
    return reply.status(201).send({ ok: true, handle });
  } catch (error) {
    if (error instanceof Error && error.message === 'PROFILE_EXISTS') {
      return reply.status(409).send({ error: 'Profile already exists' });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return reply.status(409).send({ error: 'Handle unavailable' });
    }
    request.log.error({ err: error }, 'Onboarding failed');
    return reply.status(503).send({ error: 'Service unavailable' });
  }
});

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid PORT');
}

try {
  await app.listen({ port, host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(closeDatabase).catch((error: unknown) => app.log.error({ err: error }, 'Shutdown error'));
  });
}
