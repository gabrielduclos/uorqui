import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import Fastify from 'fastify';
import { getPool, closeDatabase } from '../dist/db/client.js';
import { registerMailRoutes } from '../dist/mail-routes.js';
import { openMailSecret, sealMailSecret } from '../dist/mail-providers.js';

// This suite must only run against disposable local/CI PostgreSQL.
const dbUrl = new URL(process.env.DATABASE_URL || 'http://missing');
assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(dbUrl.hostname), 'Use temporary PostgreSQL for mail tests');
process.env.NODE_ENV = 'test';
process.env.WEB_ORIGIN = 'http://localhost:5173';
process.env.MAIL_TOKEN_KEY = randomBytes(32).toString('base64');
for (const provider of ['GOOGLE', 'MICROSOFT']) {
  process.env['MAIL_' + provider + '_CLIENT_ID'] = 'test-client';
  process.env['MAIL_' + provider + '_CLIENT_SECRET'] = 'test-only-client-secret';
}
const app = Fastify();
registerMailRoutes(app, async request => request.headers['x-test-user'] ? { user: { id: request.headers['x-test-user'] } } : null);
const alice = randomUUID(), bob = randomUUID();
const realFetch = globalThis.fetch;
let calls = [];
let tokenFailure = false;
let mailboxFailure = false;
before(async () => {
  await getPool().query('INSERT INTO users (id,handle) VALUES ($1,$2),($3,$4)', [alice, 'mail_' + alice.slice(0, 8), bob, 'mail_' + bob.slice(0, 8)]);
  await app.ready();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push({ url, init });
    if (url.hostname === 'oauth2.googleapis.com' || url.pathname.endsWith('/token')) return tokenFailure ? Response.json({ error: 'invalid_client' }, { status: 400 }) : Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 });
    if (url.pathname.endsWith('/profile')) return mailboxFailure ? Response.json({ error: 'forbidden' }, { status: 403 }) : Response.json({ emailAddress: 'alice@example.test' });
    if (url.pathname === '/v1.0/me') return Response.json({ mail: 'alice@outlook.test' });
    if (url.pathname.endsWith('/send') || url.pathname.endsWith('/sendMail')) return new Response(null, { status: 202 });
    if (url.hostname === 'graph.microsoft.com' && url.pathname.endsWith('/messages')) return Response.json({ value: [{ id: 'outlook-id', subject: 'Outlook mail', bodyPreview: 'hello', isRead: true }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=20' });
    if (url.pathname.endsWith('/messages')) return Response.json({ messages: [{ id: 'abc123' }], nextPageToken: 'page-2' });
    if (url.pathname.endsWith('/messages/abc123')) return Response.json({ id: 'abc123', internalDate: '1700000000000', labelIds: ['UNREAD', 'STARRED'], snippet: 'Test email', payload: {
      mimeType: 'multipart/alternative', headers: [{ name: 'From', value: 'Sender <sender@example.test>' }, { name: 'To', value: 'alice@example.test' }, { name: 'Subject', value: 'Olá' }],
      parts: [{ mimeType: 'text/html', body: { data: Buffer.from('<script>alert(1)</script>').toString('base64url') } }, { mimeType: 'text/plain', body: { data: Buffer.from('Mensagem em texto').toString('base64url') } }],
    } });
    throw Error('Unexpected provider URL: ' + url.origin + url.pathname);
  };
});
after(async () => {
  globalThis.fetch = realFetch;
  await getPool().query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[alice, bob]]);
  await app.close(); await closeDatabase();
});
function request(path, { user = alice, method = 'GET', body, origin = 'http://localhost:5173' } = {}) {
  return app.inject({ method, url: '/api/v1/mail/' + path, headers: { ...(user ? { 'x-test-user': user } : {}), ...(origin ? { origin } : {}) }, ...(body ? { payload: body } : {}) });
}
async function start(provider = 'gmail') {
  const result = await request('oauth/' + provider, { method: 'POST', body: {} });
  assert.equal(result.statusCode, 200);
  return new URL(result.json().url);
}
async function connect(provider = 'gmail') {
  const url = await start(provider);
  const callback = await request('oauth/' + provider + '/callback?state=' + url.searchParams.get('state') + '&code=test-code');
  assert.equal(callback.statusCode, 302); assert.match(callback.headers.location, /mail=connected/);
  return (await request('accounts')).json().accounts.find(account => account.provider === provider);
}
test('encrypted mail credentials reject tampering', () => {
  const sealed = sealMailSecret('private-refresh-token');
  assert.ok(!sealed.includes('private-refresh-token')); assert.equal(openMailSecret(sealed), 'private-refresh-token');
  const bytes = Buffer.from(sealed, 'base64'); bytes[15] ^= 1;
  assert.throws(() => openMailSecret(bytes.toString('base64')));
});
test('OAuth requires session, trusted origin, PKCE and a single-use account-bound state', async () => {
  assert.equal((await request('accounts', { user: null })).statusCode, 401);
  assert.equal((await request('oauth/gmail', { method: 'POST', body: {}, origin: 'https://evil.test' })).statusCode, 403);
  const url = await start(); const state = url.searchParams.get('state');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256'); assert.ok(url.searchParams.get('code_challenge'));
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:5173/api/v1/mail/oauth/gmail/callback');
  assert.equal((await request('accounts')).json().webOrigin, 'http://localhost:5173');
  const wrongUser = await request('oauth/gmail/callback?state=' + state + '&code=test', { user: bob });
  assert.match(wrongUser.headers.location, /mail=failed&mail_reason=state/);
  const valid = await request('oauth/gmail/callback?state=' + state + '&code=test'); assert.match(valid.headers.location, /mail=connected/);
  const replay = await request('oauth/gmail/callback?state=' + state + '&code=test'); assert.match(replay.headers.location, /mail=failed&mail_reason=state/);
  const db = await getPool().query('SELECT tokens FROM mail_connections WHERE user_id=$1', [alice]);
  assert.ok(!db.rows[0].tokens.includes('test-refresh'));
  assert.ok(!JSON.stringify((await request('accounts')).json()).includes('tokens'));
});
test('expired OAuth state and denied consent never connect', async () => {
  const url = await start();
  await getPool().query('UPDATE mail_oauth_states SET expires_at=now()-interval \'1 minute\' WHERE user_id=$1', [alice]);
  assert.match((await request('oauth/gmail/callback?state=' + url.searchParams.get('state') + '&code=test')).headers.location, /mail=failed&mail_reason=state/);
  const denied = await start();
  assert.match((await request('oauth/gmail/callback?state=' + denied.searchParams.get('state') + '&error=access_denied')).headers.location, /mail=failed&mail_reason=denied/);
});
test('OAuth callback returns sanitized session, token and Gmail API failure codes', async () => {
  const first = await start();
  const state = first.searchParams.get('state');
  const withoutSession = await request('oauth/gmail/callback?state=' + state + '&code=private-code', { user: null });
  assert.match(withoutSession.headers.location, /mail=failed&mail_reason=session/);
  assert.doesNotMatch(withoutSession.headers.location, /private-code|state=/);
  // Missing session must not consume the original state.
  const valid = await request('oauth/gmail/callback?state=' + state + '&code=test');
  assert.match(valid.headers.location, /mail=connected/);

  const second = await start();
  tokenFailure = true;
  let badToken;
  try { badToken = await request('oauth/gmail/callback?state=' + second.searchParams.get('state') + '&code=private-code'); }
  finally { tokenFailure = false; }
  assert.match(badToken.headers.location, /mail=failed&mail_reason=token/);
  assert.doesNotMatch(badToken.headers.location, /private-code|invalid_client/);

  const third = await start();
  mailboxFailure = true;
  let badMailbox;
  try { badMailbox = await request('oauth/gmail/callback?state=' + third.searchParams.get('state') + '&code=private-code'); }
  finally { mailboxFailure = false; }
  assert.match(badMailbox.headers.location, /mail=failed&mail_reason=mailbox/);
  assert.doesNotMatch(badMailbox.headers.location, /private-code|forbidden/);
});

test('mail reads isolate accounts and return plain text only', async () => {
  const account = await connect();
  assert.equal((await request('accounts/' + account.id + '/messages', { user: bob })).statusCode, 404);
  const list = await request('accounts/' + account.id + '/messages?folder=inbox&filter=unread');
  assert.equal(list.statusCode, 200); assert.equal(list.json().messages[0].subject, 'Olá'); assert.equal(list.json().nextPage, 'page-2');
  const detail = await request('accounts/' + account.id + '/messages/abc123');
  assert.equal(detail.json().body, 'Mensagem em texto'); assert.ok(!detail.body.includes('<script>'));
  assert.equal(detail.headers['cache-control'], 'private, no-store');
  const forbidden = await request('accounts/' + account.id, { user: bob, method: 'DELETE' }); assert.equal(forbidden.statusCode, 200);
  assert.equal((await request('accounts/' + account.id + '/messages')).statusCode, 200);
});
test('send rejects header injection and cross-origin requests, refreshes tokens and delivers through the provider', async () => {
  const account = await connect(); const path = 'accounts/' + account.id + '/send';
  const body = { to: 'receiver@example.test', subject: 'Olá', body: 'Teste de envio' };
  assert.equal((await request(path, { method: 'POST', body, origin: 'https://evil.test' })).statusCode, 403);
  assert.equal((await request(path, { method: 'POST', body: { ...body, to: 'ok@example.test\r\nBcc: bad@example.test' } })).statusCode, 400);
  assert.equal((await request(path, { method: 'POST', body: { ...body, subject: 'Hello\r\nBcc: bad@example.test' } })).statusCode, 400);
  assert.equal((await request(path, { user: bob, method: 'POST', body })).statusCode, 404);
  await getPool().query('UPDATE mail_connections SET tokens=$1 WHERE id=$2', [sealMailSecret(JSON.stringify({ access_token: 'expired', refresh_token: 'old-refresh', expires_at: 0 })), account.id]);
  calls = []; const sent = await request(path, { method: 'POST', body }); assert.equal(sent.statusCode, 200);
  assert.ok(calls.some(call => call.url.hostname === 'oauth2.googleapis.com' && String(call.init.body).includes('grant_type=refresh_token')));
  const payload = JSON.parse(calls.find(call => call.url.pathname.endsWith('/send')).init.body);
  assert.match(Buffer.from(payload.raw, 'base64url').toString(), /To: receiver@example.test/);
  const stored = await getPool().query('SELECT tokens FROM mail_connections WHERE id=$1', [account.id]);
  assert.equal(JSON.parse(openMailSecret(stored.rows[0].tokens)).refresh_token, 'test-refresh');
});
test('Outlook uses Graph and constrained pagination, and supports disconnect', async () => {
  const account = await connect('outlook'); calls = [];
  const list = await request('accounts/' + account.id + '/messages?folder=sent&filter=starred&page=' + encodeURIComponent('$skip=20&host=https://evil.test'));
  assert.equal(list.statusCode, 200); assert.equal(list.json().messages[0].subject, 'Outlook mail');
  assert.ok(calls.every(call => call.url.hostname === 'graph.microsoft.com'));
  assert.equal(calls[0].url.searchParams.get('host'), null); assert.equal(calls[0].url.searchParams.get('$skip'), '20');
  assert.match(calls[0].url.searchParams.get('$filter'), /^receivedDateTime/);
  assert.equal((await request('accounts/' + account.id + '/send', { method: 'POST', body: { to: 'receiver@example.test', subject: 'Test', body: 'Outlook send' } })).statusCode, 200);
  assert.ok(calls.some(call => call.url.pathname === '/v1.0/me/sendMail'));
  assert.equal((await request('accounts/' + account.id, { method: 'DELETE' })).statusCode, 200);
  assert.equal((await request('accounts/' + account.id + '/messages')).statusCode, 404);
});
