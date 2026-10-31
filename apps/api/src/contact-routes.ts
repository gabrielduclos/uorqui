import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';

type SessionReader = (request: FastifyRequest) => Promise<{ user: { id: string } } | null>;
const handleParam = { type: 'string', pattern: '^[a-z][a-z0-9_]{2,31}$' } as const;
const maxContacts = 500;

function originAllowed(request: FastifyRequest) {
  return request.headers.origin === (process.env.WEB_ORIGIN ?? 'http://localhost:5173');
}

export function registerContactRoutes(app: FastifyInstance, readSession: SessionReader) {
  async function owner(request: FastifyRequest) {
    const session = await readSession(request);
    if (!session) return null;
    const result = await getPool().query('SELECT id FROM users WHERE id=$1', [session.user.id]);
    return (result.rows[0]?.id as string | undefined) ?? null;
  }

  app.get('/api/v1/contacts', async (request, reply) => {
    try {
      const me = await owner(request);
      if (!me) return reply.code(401).send({ error: 'Unauthorized' });
      const result = await getPool().query(
        'SELECT u.handle, p.display_name AS "displayName", p.avatar_url AS "avatarUrl", c.created_at AS "addedAt" ' +
        'FROM user_contacts c JOIN users u ON u.id=c.contact_id JOIN profiles p ON p.user_id=u.id ' +
        'WHERE c.owner_id=$1 AND p.is_public=true ORDER BY lower(p.display_name),u.handle LIMIT $2',
        [me, maxContacts],
      );
      // Contacts are private to their owner. Never return e-mail, presence or session data.
      return reply.header('Cache-Control', 'private, no-store').send({ contacts: result.rows });
    } catch (error) {
      request.log.error({ err: error }, 'List contacts failed');
      return reply.code(503).send({ error: 'Service unavailable' });
    }
  });

  app.post('/api/v1/contacts', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['handle'],
      properties: { handle: handleParam } } },
  }, async (request, reply) => {
    if (!originAllowed(request)) return reply.code(403).send({ error: 'Invalid origin' });
    try {
      const me = await owner(request);
      if (!me) return reply.code(401).send({ error: 'Unauthorized' });
      const { handle } = request.body as { handle: string };
      const found = await getPool().query(
        'SELECT u.id FROM users u JOIN profiles p ON p.user_id=u.id ' +
        'WHERE u.handle=$1 AND u.id<>$2 AND p.is_public=true LIMIT 1',
        [handle, me],
      );
      if (!found.rowCount) return reply.code(404).send({ error: 'Contact unavailable' });
      const contactId = found.rows[0].id as string;
      const existing = await getPool().query(
        'SELECT 1 FROM user_contacts WHERE owner_id=$1 AND contact_id=$2', [me, contactId],
      );
      if (!existing.rowCount) {
        // This bound prevents unlimited personal directories and surprise storage growth.
        const count = await getPool().query('SELECT COUNT(*)::int AS total FROM user_contacts WHERE owner_id=$1', [me]);
        if (Number(count.rows[0].total) >= maxContacts) {
          return reply.code(409).send({ error: 'Contact limit reached' });
        }
      }
      await getPool().query(
        'INSERT INTO user_contacts(owner_id,contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [me, contactId],
      );
      return reply.header('Cache-Control', 'private, no-store').send({ ok: true, handle });
    } catch (error) {
      request.log.error({ err: error }, 'Save contact failed');
      return reply.code(503).send({ error: 'Service unavailable' });
    }
  });

  app.delete('/api/v1/contacts/:handle', {
    schema: { params: { type: 'object', additionalProperties: false, required: ['handle'],
      properties: { handle: handleParam } } },
  }, async (request, reply) => {
    if (!originAllowed(request)) return reply.code(403).send({ error: 'Invalid origin' });
    try {
      const me = await owner(request);
      if (!me) return reply.code(401).send({ error: 'Unauthorized' });
      const { handle } = request.params as { handle: string };
      await getPool().query(
        'DELETE FROM user_contacts c USING users u WHERE c.owner_id=$1 AND c.contact_id=u.id AND u.handle=$2',
        [me, handle],
      );
      // Removing a saved contact must never delete their DM history.
      return reply.header('Cache-Control', 'private, no-store').code(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Remove contact failed');
      return reply.code(503).send({ error: 'Service unavailable' });
    }
  });
}
