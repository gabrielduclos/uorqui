import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';
import { allowedWebOrigins } from './auth/web-origins.js';
import { authorizationUrl, exchangeTokens, getMailMessage, isMailProvider, listMail, mailboxEmail, mailProviderReady,
  openMailSecret, randomSecret, sealMailSecret, sendMail, stateHash, type MailProvider, type MailTokens } from './mail-providers.js';

type SessionReader = (request: FastifyRequest) => Promise<{ user: { id: string } } | null>;
type Connection = { id: string; provider: MailProvider; email: string; tokens: string };
const uuid = { type: 'string', format: 'uuid' };
const accountParams = { type: 'object', required: ['accountId'], properties: { accountId: uuid } };

export function registerMailRoutes(app: FastifyInstance, readSession: SessionReader) {
  async function user(request: FastifyRequest, reply: FastifyReply) {
    reply.header('Cache-Control', 'private, no-store');
    const session = await readSession(request);
    if (!session) { reply.code(401).send({ error: 'Unauthorized' }); return null; }
    return session.user.id;
  }
  function originAllowed(request: FastifyRequest, reply: FastifyReply) {
    if (!request.headers.origin || !allowedWebOrigins().includes(request.headers.origin)) {
      reply.code(403).send({ error: 'Invalid origin' }); return false;
    }
    return true;
  }
  function unavailable(reply: FastifyReply, error: unknown) {
    const reconnect = error instanceof Error && error.message === 'MAIL_RECONNECT';
    return reply.code(reconnect ? 409 : 503).send({ error: reconnect ? 'MAIL_RECONNECT' : 'MAIL_UNAVAILABLE' });
  }
  async function withMailbox<T>(userId: string, accountId: string, run: (connection: Connection, token: string) => Promise<T>) {
    // Serializing refreshes prevents overwriting rotating Microsoft refresh tokens.
    const db = await getPool().connect();
    let connection: Connection;
    let tokens: MailTokens;
    try {
      await db.query('BEGIN');
      const found = await db.query<Connection>('SELECT id,provider,email,tokens FROM mail_connections WHERE id=$1 AND user_id=$2 FOR UPDATE', [accountId, userId]);
      if (!found.rows[0]) { await db.query('ROLLBACK'); return null; }
      connection = found.rows[0];
      tokens = JSON.parse(openMailSecret(connection.tokens)) as MailTokens;
      if (tokens.expires_at < Date.now() + 60_000) {
        tokens = await exchangeTokens(connection.provider, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token }, tokens.refresh_token);
        await db.query('UPDATE mail_connections SET tokens=$1,updated_at=now() WHERE id=$2', [sealMailSecret(JSON.stringify(tokens)), accountId]);
      }
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
    return run(connection!, tokens!.access_token);
  }

  app.get('/api/v1/mail/accounts', async (request, reply) => {
    try {
      const id = await user(request, reply); if (!id) return;
      const providers = ['gmail', 'outlook'].map(provider => ({ id: provider, configured: mailProviderReady(provider as MailProvider) }));
      try {
        const accounts = await getPool().query('SELECT id,provider,email FROM mail_connections WHERE user_id=$1 ORDER BY provider', [id]);
        return { accounts: accounts.rows, providers };
      } catch (error) {
        // A frontend release may precede migration/configuration. Existing
        // connections remain visible and disconnectable if OAuth is disabled.
        if (!providers.some(provider => provider.configured) && typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01') return { accounts: [], providers };
        throw error;
      }
    } catch (error) { return unavailable(reply, error); }
  });

  app.post('/api/v1/mail/oauth/:provider', { schema: { params: { type: 'object', required: ['provider'], properties: { provider: { enum: ['gmail', 'outlook'] } } } } }, async (request, reply) => {
    if (!originAllowed(request, reply)) return;
    try {
      const id = await user(request, reply); if (!id) return;
      const provider = (request.params as { provider: MailProvider }).provider;
      if (!mailProviderReady(provider)) return reply.code(503).send({ error: 'MAIL_NOT_CONFIGURED' });
      const state = randomSecret(), verifier = randomSecret();
      await getPool().query('DELETE FROM mail_oauth_states WHERE expires_at < now() OR (user_id=$1 AND provider=$2)', [id, provider]);
      await getPool().query('INSERT INTO mail_oauth_states (state_hash,user_id,provider,verifier,expires_at) VALUES ($1,$2,$3,$4,now()+interval \'10 minutes\')',
        [stateHash(state), id, provider, sealMailSecret(verifier)]);
      return { url: authorizationUrl(provider, state, verifier) };
    } catch (error) { return unavailable(reply, error); }
  });

  app.get('/api/v1/mail/oauth/:provider/callback', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store').header('Referrer-Policy', 'no-referrer');
    const destination = new URL('/', process.env.WEB_ORIGIN ?? 'http://localhost:5173');
    const done = (status: string) => { destination.searchParams.set('mail', status); return reply.redirect(destination.toString()); };
    try {
      const provider = (request.params as { provider: string }).provider;
      const query = request.query as { state?: string; code?: string; error?: string };
      const session = await readSession(request);
      if (!session || !isMailProvider(provider) || typeof query.state !== 'string' || query.state.length > 256) return done('failed');
      const consumed = await getPool().query<{ verifier: string }>('DELETE FROM mail_oauth_states WHERE state_hash=$1 AND user_id=$2 AND provider=$3 AND expires_at>now() RETURNING verifier',
        [stateHash(query.state), session.user.id, provider]);
      if (!consumed.rows[0] || query.error || typeof query.code !== 'string' || query.code.length > 4096) return done('failed');
      const tokens = await exchangeTokens(provider, { grant_type: 'authorization_code', code: query.code, code_verifier: openMailSecret(consumed.rows[0].verifier) });
      const email = await mailboxEmail(provider, tokens.access_token);
      await getPool().query('INSERT INTO mail_connections (user_id,provider,email,tokens) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,provider) DO UPDATE SET email=excluded.email,tokens=excluded.tokens,updated_at=now()',
        [session.user.id, provider, email, sealMailSecret(JSON.stringify(tokens))]);
      return done('connected');
    } catch { return done('failed'); }
  });

  app.delete('/api/v1/mail/accounts/:accountId', { schema: { params: accountParams } }, async (request, reply) => {
    if (!originAllowed(request, reply)) return;
    try {
      const id = await user(request, reply); if (!id) return;
      const accountId = (request.params as { accountId: string }).accountId;
      await getPool().query('DELETE FROM mail_connections WHERE id=$1 AND user_id=$2', [accountId, id]);
      return { ok: true };
    } catch (error) { return unavailable(reply, error); }
  });

  app.get('/api/v1/mail/accounts/:accountId/messages', { schema: { params: accountParams, querystring: {
    type: 'object', additionalProperties: false, properties: { folder: { enum: ['inbox', 'sent'], default: 'inbox' }, filter: { enum: ['all', 'unread', 'starred'], default: 'all' }, page: { type: 'string', maxLength: 4096 } },
  } } }, async (request, reply) => {
    try {
      const id = await user(request, reply); if (!id) return;
      const { accountId } = request.params as { accountId: string };
      const query = request.query as { folder: 'inbox' | 'sent'; filter: 'all' | 'unread' | 'starred'; page?: string };
      const result = await withMailbox(id, accountId, (connection, token) => listMail(connection.provider, token, query.folder, query.filter, query.page));
      return result ?? reply.code(404).send({ error: 'MAIL_ACCOUNT_NOT_FOUND' });
    } catch (error) { return unavailable(reply, error); }
  });

  app.get('/api/v1/mail/accounts/:accountId/messages/:messageId', { schema: { params: { ...accountParams, required: ['accountId', 'messageId'], properties: {
    accountId: uuid, messageId: { type: 'string', minLength: 1, maxLength: 1024, pattern: '^[A-Za-z0-9_=+/\\-]+$' },
  } } } }, async (request, reply) => {
    try {
      const id = await user(request, reply); if (!id) return;
      const { accountId, messageId } = request.params as { accountId: string; messageId: string };
      const result = await withMailbox(id, accountId, (connection, token) => getMailMessage(connection.provider, token, messageId));
      return result ?? reply.code(404).send({ error: 'MAIL_ACCOUNT_NOT_FOUND' });
    } catch (error) { return unavailable(reply, error); }
  });

  app.post('/api/v1/mail/accounts/:accountId/send', { schema: { params: accountParams, body: {
    type: 'object', additionalProperties: false, required: ['to', 'subject', 'body'], properties: {
      to: { type: 'string', maxLength: 320, pattern: '^[A-Za-z0-9.!#$%&\x27*+/=?^_`{|}~\\-]+@[A-Za-z0-9](?:[A-Za-z0-9.\\-]*[A-Za-z0-9])?\\.[A-Za-z]{2,}$' },
      subject: { type: 'string', maxLength: 200, pattern: '^[^\\r\\n]*$' }, body: { type: 'string', minLength: 1, maxLength: 30000 },
    },
  } } }, async (request, reply) => {
    if (!originAllowed(request, reply)) return;
    try {
      const id = await user(request, reply); if (!id) return;
      const { accountId } = request.params as { accountId: string };
      const result = await withMailbox(id, accountId, async (connection, token) => {
        await sendMail(connection.provider, token, connection.email, request.body as { to: string; subject: string; body: string });
        return { ok: true };
      });
      return result ?? reply.code(404).send({ error: 'MAIL_ACCOUNT_NOT_FOUND' });
    } catch (error) { return unavailable(reply, error); }
  });
}
