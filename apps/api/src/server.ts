import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fromNodeHeaders } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import { getAuth } from './auth/auth.js';
import { isDevelopmentSignupEnabled, isPublicSignupEnabled, isRegistrationAvailable, verifyRegistrationChallenge } from './auth/registration.js';
import { createDatabase, closeDatabase, getPool } from './db/client.js';
import { profiles, users } from './db/schema.js';
import { registerProfileRoutes } from './profile-routes.js';
import { registerDirectMessageRoutes } from './direct-message-routes.js';
import { registerFriendRoutes } from './friend-routes.js';
import { registerBlockRoutes } from './block-routes.js';
import { registerCommunityRoutes } from './community-routes.js';
import { registerCommunityVoiceRoutes } from './community-voice-routes.js';
import { registerCommunityModerationRoutes } from './community-moderation-routes.js';
import { closeDmEvents } from './dm-events.js';

const app = Fastify({
  logger: {
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
  },
  bodyLimit: 64 * 1024,
});

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
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
    // Verify the app schema and migration journal, not only TCP connectivity.
    const result = await getPool().query<{
      social_ready: boolean;
      auth_ready: boolean;
      migration_count: string;
    }>(`
      SELECT
        to_regclass('public.users') IS NOT NULL
          AND to_regclass('public.profiles') IS NOT NULL AS social_ready,
        to_regclass('public.user') IS NOT NULL
          AND to_regclass('public.account') IS NOT NULL
          AND to_regclass('public.session') IS NOT NULL
          AND to_regclass('public.verification') IS NOT NULL AS auth_ready,
        (SELECT count(*) FROM drizzle.__drizzle_migrations)::text AS migration_count
    `);
    const row = result.rows[0];
    if (!row?.social_ready || !row?.auth_ready || Number(row.migration_count) < 2) {
      return reply.status(503).send({ ok: false, database: 'schema_incomplete' });
    }
    return { ok: true, database: 'connected', schema: 'ready' };
  } catch (error) {
    app.log.error({ err: error }, 'Database health check failed');
    return reply.status(503).send({ ok: false, database: 'unavailable' });
  }
});

app.get('/health/ready', async (request, reply) => {
  // Readiness verifies BOTH identity configuration and the migrated database.
  // No secrets, connection details or stack traces are exposed to callers.
  try {
    getAuth(); // checks AUTH_SECRET and production HTTPS origins.
    const db = await app.inject({ method: 'GET', url: '/health/db' });
    if (db.statusCode !== 200) {
      return reply.status(503).send({ ok: false, status: 'unavailable' });
    }
    return { ok: true, service: 'uorqui-api', status: 'ready' };
  } catch (error) {
    request.log.error({ err: error }, 'API readiness failed');
    return reply.status(503).send({ ok: false, status: 'unavailable' });
  }
});

app.get('/api/v1/status', async () => ({
  project: 'uorqui',
  stage: 'auth-development',
  featuresEnabled: ['auth-scaffold', 'user-profiles', 'direct-messaging', 'realtime-dm-sse', 'friend-requests', 'account-blocks', 'community-channels', 'community-text', 'community-voice-mesh'],
  publicRegistration: isPublicSignupEnabled(),
  registrationAvailable: isRegistrationAvailable(),
  developmentRegistrationEnabled: isDevelopmentSignupEnabled(),
  emailVerificationRequired: isPublicSignupEnabled(),
  passwordRecoveryAvailable: isPublicSignupEnabled(),
  turnstileSiteKey: isPublicSignupEnabled() ? process.env.TURNSTILE_SITE_KEY : null,
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
      // Verify the challenge on the server, including direct requests to Render.
      // A browser-only CAPTCHA check would be trivial to bypass.
      let authBody = request.body;
      const guarded = new Set(['/api/auth/sign-up/email', '/api/auth/request-password-reset', '/api/auth/send-verification-email']);
      if (isPublicSignupEnabled() && request.method === 'POST' && guarded.has(request.url.split('?')[0])) {
        const payload = request.body as Record<string, unknown> | undefined;
        const token = typeof payload?.captchaToken === 'string' ? payload.captchaToken : '';
        if (!await verifyRegistrationChallenge(token, request.ip)) {
          return reply.status(403).send({ error: 'Verificação de segurança não concluída. Tente novamente.' });
        }
        const { captchaToken: _captchaToken, ...clean } = payload ?? {};
        authBody = clean;
      }
      const url = new URL(request.raw.url ?? request.url, process.env.AUTH_BASE_URL ?? 'http://localhost:3001');
      if (request.method === 'GET' && url.pathname === '/api/auth/verify-email') {
        // Previously sent confirmation links point their callback to the homepage.
        // Force a canonical result page for both old and new links; Better Auth
        // still validates the original signed token and appends ?error= on failure.
        const frontend = new URL(process.env.WEB_ORIGIN ?? 'http://localhost:5173');
        const result = new URL('/auth/email-verification?result=success', frontend);
        url.searchParams.set('callbackURL', result.toString());
      }
      const headers = fromNodeHeaders(request.headers);
      const authRequest = new Request(url, {
        method: request.method,
        headers,
        ...(authBody ? { body: JSON.stringify(authBody) } : {}),
      });
      const response = await getAuth().handler(authRequest);

      reply.status(response.status);
      if (request.method === 'GET' && url.pathname === '/api/auth/verify-email') {
        reply.header('Cache-Control', 'no-store');
        reply.header('Referrer-Policy', 'no-referrer');
      }
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
        avatarUrl: profiles.avatarUrl,
        coverUrl: profiles.coverUrl,
        isPublic: profiles.isPublic,
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
  if (displayName.trim().length < 2) return reply.status(400).send({ error: 'Invalid display name' });

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

registerProfileRoutes(app, async request => readSession(request));
registerDirectMessageRoutes(app, async request => readSession(request));
registerFriendRoutes(app, async request => readSession(request));
registerBlockRoutes(app, async request => readSession(request));
registerCommunityRoutes(app, async request => readSession(request));
registerCommunityVoiceRoutes(app, async request => readSession(request));
registerCommunityModerationRoutes(app, async request => readSession(request));

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid PORT');
}

try {
  // Managed Node hosting (Render, Railway, etc.) needs a public container bind.
  // Local development continues to listen on loopback by default.
  const host = process.env.HOST ?? (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(closeDmEvents).then(closeDatabase).catch((error: unknown) => app.log.error({ err: error }, 'Shutdown error'));
  });
}
