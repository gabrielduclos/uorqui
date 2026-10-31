import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq, ilike, or } from 'drizzle-orm';
import { createDatabase } from './db/client.js';
import { profiles, users } from './db/schema.js';

type SessionReader = (request: FastifyRequest) => Promise<{ user: { id: string } } | null>;

const forbiddenHandles = new Set(['admin', 'support', 'uorqui', 'system', 'moderator', 'root', 'api', 'auth', 'settings', 'help', 'privacy']);
const profileFields = {
  id: users.id, handle: users.handle, displayName: profiles.displayName,
  bio: profiles.bio, avatarUrl: profiles.avatarUrl, coverUrl: profiles.coverUrl,
  isPublic: profiles.isPublic, createdAt: users.createdAt,
};

function sanitizedImageUrl(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return value === undefined ? undefined : null;
  if (typeof value !== 'string' || value.length > 2000) throw new Error('INVALID_IMAGE_URL');
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw new Error();
    return parsed.toString();
  } catch { throw new Error('INVALID_IMAGE_URL'); }
}

/** Profile-only endpoints. No public API ever returns email, sessions or private details. */
export function registerProfileRoutes(app: FastifyInstance, readSession: SessionReader) {
  app.get('/api/v1/profiles/search', {
    schema: {
      querystring: {
        type: 'object', additionalProperties: false,
        required: ['q'],
        properties: { q: { type: 'string', minLength: 2, maxLength: 40 } },
      },
    },
  }, async (request, reply) => {
    const { q } = request.query as { q: string };
    const search = q.trim().replace(/^@/, '');
    if (search.length < 2) return reply.status(400).send({ error: 'Search term is too short' });
    // Escape LIKE wildcard characters so search input cannot expand to an unbounded match.
    const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
    try {
      const matches = await createDatabase()
        .select({ handle: users.handle, displayName: profiles.displayName, avatarUrl: profiles.avatarUrl })
        .from(users).innerJoin(profiles, eq(users.id, profiles.userId))
        .where(and(eq(profiles.isPublic, true),
          or(ilike(users.handle, pattern), ilike(profiles.displayName, pattern))))
        .orderBy(users.handle).limit(15);
      return reply.header('Cache-Control', 'no-store').send({ results: matches });
    } catch (error) {
      request.log.error({ err: error }, 'Profile search failed');
      return reply.status(503).send({ error: 'Service unavailable' });
    }
  });

  app.get('/api/v1/profiles/:handle', {
    schema: {
      params: {
        type: 'object', additionalProperties: false,
        required: ['handle'],
        properties: { handle: { type: 'string', pattern: '^@?[a-zA-Z][a-zA-Z0-9_]{2,31}$' } },
      },
    },
  }, async (request, reply) => {
    const { handle } = request.params as { handle: string };
    try {
      const [record] = await createDatabase()
        .select(profileFields).from(users)
        .innerJoin(profiles, eq(users.id, profiles.userId))
        .where(eq(users.handle, handle.replace(/^@/, '').toLowerCase()))
        .limit(1);
      if (!record || !record.isPublic) return reply.status(404).send({ error: 'Profile not found' });
      const { isPublic: _visibility, ...publicData } = record;
      return reply.header('Cache-Control', 'no-store').send({ profile: publicData });
    } catch (error) {
      request.log.error({ err: error }, 'Get public profile failed');
      return reply.status(503).send({ error: 'Service unavailable' });
    }
  });

  app.patch('/api/v1/me/profile', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, minProperties: 1,
        properties: {
          handle: { type: 'string', pattern: '^[a-z][a-z0-9_]{2,31}$', maxLength: 32 },
          displayName: { type: 'string', minLength: 2, maxLength: 120 },
          bio: { anyOf: [{ type: 'string', maxLength: 500 }, { type: 'null' }] },
          avatarUrl: { anyOf: [{ type: 'string', maxLength: 2000 }, { type: 'null' }] },
          coverUrl: { anyOf: [{ type: 'string', maxLength: 2000 }, { type: 'null' }] },
          isPublic: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    let session: Awaited<ReturnType<SessionReader>>;
    try { session = await readSession(request); }
    catch (error) {
      request.log.error({ err: error }, 'Profile session validation failed');
      return reply.status(503).send({ error: 'Service unavailable' });
    }
    if (!session) return reply.status(401).send({ error: 'Unauthorized' });

    const body = request.body as {
      handle?: string; displayName?: string; bio?: string | null;
      avatarUrl?: string | null; coverUrl?: string | null; isPublic?: boolean;
    };
    if (body.handle && forbiddenHandles.has(body.handle)) return reply.status(400).send({ error: 'Handle unavailable' });
    const displayName = body.displayName?.trim();
    if (displayName !== undefined && displayName.length < 2) return reply.status(400).send({ error: 'Invalid display name' });
    const bio = body.bio === undefined ? undefined : body.bio?.trim() || null;
    let avatarUrl: string | null | undefined;
    let coverUrl: string | null | undefined;
    try {
      avatarUrl = sanitizedImageUrl(body.avatarUrl);
      coverUrl = sanitizedImageUrl(body.coverUrl);
    } catch {
      return reply.status(400).send({ error: 'Image URL must be a valid HTTPS address' });
    }

    try {
      const record = await createDatabase().transaction(async (tx) => {
        const [owner] = await tx.select({ id: users.id })
          .from(users).where(eq(users.id, session.user.id)).limit(1);
        if (!owner) return null;
        if (body.handle !== undefined) {
          await tx.update(users).set({ handle: body.handle }).where(eq(users.id, session.user.id));
        }
        const changes = {
          ...(displayName !== undefined ? { displayName } : {}),
          ...(body.bio !== undefined ? { bio } : {}),
          ...(body.avatarUrl !== undefined ? { avatarUrl } : {}),
          ...(body.coverUrl !== undefined ? { coverUrl } : {}),
          ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
          updatedAt: new Date(),
        };
        await tx.update(profiles).set(changes).where(eq(profiles.userId, session.user.id));
        const [updated] = await tx.select(profileFields)
          .from(users).innerJoin(profiles, eq(users.id, profiles.userId))
          .where(eq(users.id, session.user.id)).limit(1);
        return updated ?? null;
      });
      if (!record) return reply.status(404).send({ error: 'Profile not found' });
      return reply.header('Cache-Control', 'no-store').send({
        profile: {
          handle: record.handle, displayName: record.displayName, bio: record.bio,
          avatarUrl: record.avatarUrl, coverUrl: record.coverUrl, isPublic: record.isPublic,
        },
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        return reply.status(409).send({ error: 'Handle unavailable' });
      }
      request.log.error({ err: error }, 'Update profile failed');
      return reply.status(503).send({ error: 'Service unavailable' });
    }
  });
}
