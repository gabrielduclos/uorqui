import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';
import { withMailbox } from './mail-account-access.js';
import { allowedWebOrigins } from './auth/web-origins.js';
import { validateManualMailSettings, validateManualHosts } from './manual-mail.js';
import { authorizationUrl, exchangeTokens, getMailMessage, isMailProvider, listMail, mailboxEmail, mailProviderReady, countInboxUnread,
  openMailSecret, randomSecret, sealMailSecret, sendMail, markMailRead, replyToMail, moveMailMessages, stateHash, type OAuthMailProvider, type MailFolder } from './mail-providers.js';

type SessionReader = (request: FastifyRequest) => Promise<{ user: { id: string } } | null>;
const uuid = { type: 'string', format: 'uuid' };
const accountParams = { type: 'object', required: ['accountId'], properties: { accountId: uuid } };
const accountMessageParams = { type: 'object', required: ['accountId', 'messageId'], properties: {
  accountId: uuid, messageId: { type: 'string', minLength: 1, maxLength: 1024, pattern: '^[A-Za-z0-9_=+/\-]+$' },
} };

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

  // Polling caches per-account inbox counts; never expose other users' totals.
  app.get('/api/v1/mail/unread', async (request, reply) => {
    try {
      const id = await user(request, reply); if (!id) return;
      const result = await getPool().query<{ count: number }>(
        'SELECT COALESCE(SUM(s.unread_count),0)::int AS count '+
        'FROM mail_connections m JOIN mail_inbox_state s ON s.account_id=m.id WHERE m.user_id=$1',[id]);
      return {unreadCount:Math.max(0,result.rows[0]?.count ?? 0)};
    } catch(error) { return unavailable(reply,error); }
  });

  // Delayed browser push must not reveal mail from a disconnected account.
  app.get('/api/v1/mail/accounts/:accountId/notification-access', {schema:{params:accountParams}},async(request,reply)=>{
    try {
      const id=await user(request,reply); if(!id)return;
      const {accountId}=request.params as {accountId:string};
      const result=await getPool().query('SELECT 1 FROM mail_connections WHERE id=$1 AND user_id=$2',[accountId,id]);
      return {authorized:Boolean(result.rowCount)};
    } catch(error) { return unavailable(reply,error); }
  });

  app.get('/api/v1/mail/accounts', async (request, reply) => {
    try {
      const id = await user(request, reply); if (!id) return;
      const providers = [{ id: 'gmail', configured: mailProviderReady('gmail') }, { id: 'outlook', configured: mailProviderReady('outlook') }];
      try {
        const accounts = await getPool().query('SELECT id,provider,email FROM mail_connections WHERE user_id=$1 ORDER BY provider,email', [id]);
        return { accounts: accounts.rows, providers, webOrigin: new URL(process.env.WEB_ORIGIN ?? 'http://localhost:5173').origin };
      } catch (error) {
        // A frontend release may precede migration/configuration. Existing
        // connections remain visible and disconnectable if OAuth is disabled.
        if (!providers.some(provider => provider.configured) && typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01') return { accounts: [], providers, webOrigin: new URL(process.env.WEB_ORIGIN ?? 'http://localhost:5173').origin };
        throw error;
      }
    } catch (error) { return unavailable(reply, error); }
  });

  app.post('/api/v1/mail/oauth/:provider', { schema: { params: { type: 'object', required: ['provider'], properties: { provider: { enum: ['gmail','outlook'] } } } } }, async (request, reply) => {
    if (!originAllowed(request, reply)) return;
    try {
      const id = await user(request, reply); if (!id) return;
      const provider = (request.params as { provider: OAuthMailProvider }).provider;
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
    // Expose only a fixed diagnostic category. Never redirect OAuth codes,
    // state, provider error strings or tokens into the SPA URL or logs.
    type Failure = 'session' | 'invalid_return' | 'state' | 'denied' | 'token' | 'mailbox' | 'storage';
    const done = (status: 'connected' | 'failed', reason?: Failure) => {
      const target = new URL(destination);
      target.searchParams.set('mail', status);
      if (status === 'failed' && reason) target.searchParams.set('mail_reason', reason);
      return reply.redirect(target.toString());
    };
    let stage: Failure = 'session';
    try {
      const provider = (request.params as { provider: string }).provider;
      const query = request.query as { state?: string; code?: string; error?: string };
      const session = await readSession(request);
      if (!session) return done('failed', 'session');
      if (!isMailProvider(provider) || typeof query.state !== 'string' || query.state.length > 256) return done('failed', 'invalid_return');
      stage = 'state';
      const consumed = await getPool().query<{ verifier: string }>('DELETE FROM mail_oauth_states WHERE state_hash=$1 AND user_id=$2 AND provider=$3 AND expires_at>now() RETURNING verifier',
        [stateHash(query.state), session.user.id, provider]);
      if (!consumed.rows[0]) return done('failed', 'state');
      if (query.error) return done('failed', 'denied');
      if (typeof query.code !== 'string' || query.code.length > 4096) return done('failed', 'invalid_return');
      stage = 'token';
      const tokens = await exchangeTokens(provider, { grant_type: 'authorization_code', code: query.code, code_verifier: openMailSecret(consumed.rows[0].verifier) });
      stage = 'mailbox';
      const email = await mailboxEmail(provider, tokens.access_token);
      stage = 'storage';
      await getPool().query('INSERT INTO mail_connections (user_id,provider,email,tokens) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,provider,email) DO UPDATE SET tokens=excluded.tokens,updated_at=now()',
        [session.user.id, provider, email.trim().toLowerCase(), sealMailSecret(JSON.stringify(tokens))]);
      return done('connected');
    } catch {
      return done('failed', stage);
    }
  });

  app.post('/api/v1/mail/manual', { schema: {
    body: { type: 'object', additionalProperties: false,
      required: ['email','imapHost','imapPort','smtpHost','smtpPort','username','password'],
      properties: {
        email: { type: 'string', maxLength: 320 },
        imapHost: { type: 'string', maxLength: 253 },
        imapPort: { type: 'integer', minimum: 1, maximum: 65535 },
        smtpHost: { type: 'string', maxLength: 253 },
        smtpPort: { type: 'integer', minimum: 1, maximum: 65535 },
        username: { type: 'string', maxLength: 320 },
        password: { type: 'string', minLength: 1, maxLength: 1024 },
        smtpUsername: { type: 'string', maxLength: 320 },
        smtpPassword: { type: 'string', maxLength: 1024 },
      },
    },
  } }, async (request, reply) => {
    if (!originAllowed(request, reply)) return;
    const id = await user(request, reply); if (!id) return;
    let settings;
    try { settings = validateManualMailSettings(request.body); }
    catch { return reply.code(400).send({ error: 'MAIL_MANUAL_INVALID' }); }
    try {
      await validateManualHosts(settings);
      await getPool().query(
        'INSERT INTO mail_connections (user_id,provider,email,tokens) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,provider,email) DO UPDATE SET tokens=excluded.tokens,updated_at=now()',
        [id, 'manual', settings.email, sealMailSecret(JSON.stringify(settings))]);
      return { ok: true };
    } catch { return reply.code(503).send({ error: 'MAIL_MANUAL_UNAVAILABLE' }); }
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
    type: 'object', additionalProperties: false, properties: { folder: { enum: ['inbox', 'sent', 'spam', 'trash'], default: 'inbox' }, filter: { enum: ['all', 'unread', 'starred'], default: 'all' }, page: { type: 'string', maxLength: 4096 } },
  } } }, async (request, reply) => {
    try {
      const id = await user(request, reply); if (!id) return;
      const { accountId } = request.params as { accountId: string };
      const query = request.query as { folder: MailFolder; filter: 'all' | 'unread' | 'starred'; page?: string };
      const result = await withMailbox(id, accountId, (connection, token) => listMail(connection.provider, token, query.folder, query.filter, query.page));
      return result ?? reply.code(404).send({ error: 'MAIL_ACCOUNT_NOT_FOUND' });
    } catch (error) { return unavailable(reply, error); }
  });

  app.get('/api/v1/mail/accounts/:accountId/messages/:messageId', { schema: { params: accountMessageParams } }, async (request, reply) => {
    try {
      const id = await user(request, reply); if (!id) return;
      const { accountId, messageId } = request.params as { accountId: string; messageId: string };
      const result = await withMailbox(id, accountId, (connection, token) => getMailMessage(connection.provider, token, messageId));
      return result ?? reply.code(404).send({ error: 'MAIL_ACCOUNT_NOT_FOUND' });
    } catch (error) { return unavailable(reply, error); }
  });


  app.post('/api/v1/mail/accounts/:accountId/messages/move', { schema: {
    params: accountParams,
    body: { type: 'object', additionalProperties: false, required: ['ids', 'destination'], properties: {
      ids: { type: 'array', minItems: 1, maxItems: 100, uniqueItems: true,
        items: { type: 'string', minLength: 1, maxLength: 1024, pattern: '^[A-Za-z0-9_=+/\-]+$' } },
      destination: { enum: ['trash', 'spam'] },
    } },
  } }, async (request, reply) => {
    if (!originAllowed(request, reply)) return;
    try {
      const id = await user(request, reply); if (!id) return;
      const { accountId } = request.params as { accountId: string };
      const { ids, destination } = request.body as { ids: string[]; destination: 'trash' | 'spam' };
      const result = await withMailbox(id, accountId, async (connection, token) => {
        const moved = await moveMailMessages(connection.provider, token, ids, destination);
        if (moved.moved.length) {
          try {
            const unread = await countInboxUnread(connection.provider, token);
            await getPool().query('UPDATE mail_inbox_state SET unread_count=$2 WHERE account_id=$1',[accountId,unread]);
          } catch { /* Existing provider move succeeded; a subsequent scan updates the count. */ }
        }
        return moved;
      });
      return result ?? reply.code(404).send({ error: 'MAIL_ACCOUNT_NOT_FOUND' });
    } catch (error) { return unavailable(reply, error); }
  });

  app.post('/api/v1/mail/accounts/:accountId/messages/:messageId/read', { schema: { params: accountMessageParams } }, async (request, reply) => {
    if (!originAllowed(request, reply)) return;
    try {
      const id = await user(request, reply); if (!id) return;
      const { accountId, messageId } = request.params as { accountId: string; messageId: string };
      const result = await withMailbox(id, accountId, async (connection, token) => {
        await markMailRead(connection.provider, token, messageId);
        try {
          const unread = await countInboxUnread(connection.provider, token);
          await getPool().query('UPDATE mail_inbox_state SET unread_count=$2 WHERE account_id=$1',[accountId,unread]);
        } catch { /* Marking read succeeded; the next scan refreshes badge counts. */ }
        return { ok: true };
      });
      return result ?? reply.code(404).send({ error: 'MAIL_ACCOUNT_NOT_FOUND' });
    } catch (error) { return unavailable(reply, error); }
  });

  app.post('/api/v1/mail/accounts/:accountId/messages/:messageId/reply', {
    // Reject unexpected recipient/subject before Fastify's schema validation can
    // strip extra fields. Replies must derive the recipient from the provider.
    preValidation: async (request, reply) => {
      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          Object.keys(body).some(key => key !== 'body')) {
        return reply.code(400).send({ error: 'MAIL_INVALID_REPLY_BODY' });
      }
    },
    schema: {
    params: accountMessageParams,
    body: { type: 'object', additionalProperties: false, required: ['body'],
      properties: { body: { type: 'string', minLength: 1, maxLength: 30000, pattern: '\\S' } } },
  } }, async (request, reply) => {
    if (!originAllowed(request, reply)) return;
    try {
      const id = await user(request, reply); if (!id) return;
      const { accountId, messageId } = request.params as { accountId: string; messageId: string };
      const result = await withMailbox(id, accountId, async (connection, token) => {
        await replyToMail(connection.provider, token, connection.email, messageId, (request.body as { body: string }).body);
        return { ok: true };
      });
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
