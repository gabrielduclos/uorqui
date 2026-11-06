import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import Fastify from 'fastify';
import { getPool, closeDatabase } from '../dist/db/client.js';
import { registerMailRoutes } from '../dist/mail-routes.js';
import { registerNotificationRoutes } from '../dist/notification-routes.js';
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
const readTestSession=async request=>request.headers['x-test-user'] ? { user: { id: request.headers['x-test-user'] } } : null;
registerMailRoutes(app,readTestSession);
registerNotificationRoutes(app,readTestSession);
const alice = randomUUID(), bob = randomUUID();
const realFetch = globalThis.fetch;
let calls = [];
let tokenFailure = false;
let mailboxFailure = false;
let gmailEmail = 'alice@example.test';
before(async () => {
  await getPool().query('INSERT INTO users (id,handle) VALUES ($1,$2),($3,$4)', [alice, 'mail_' + alice.slice(0, 8), bob, 'mail_' + bob.slice(0, 8)]);
  await app.ready();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push({ url, init });
    if (url.hostname === 'oauth2.googleapis.com' || url.pathname.endsWith('/token')) return tokenFailure ? Response.json({ error: 'invalid_client' }, { status: 400 }) : Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 });
    if (url.pathname.endsWith('/profile')) return mailboxFailure ? Response.json({ error: 'forbidden' }, { status: 403 }) : Response.json({ emailAddress: gmailEmail });
    if (url.pathname === '/v1.0/me') return Response.json({ mail: 'alice@outlook.test' });
    if (url.pathname.endsWith('/send') || url.pathname.endsWith('/sendMail') || url.pathname.endsWith('/reply')) return new Response(null, { status: 202 });
    if (url.pathname.endsWith('/messages/batchModify')) return new Response(null, { status: 204 });
    if (url.pathname.endsWith('/messages/outlook-id/move')) return Response.json({ id: 'new-outlook-id' });
    if (url.pathname.endsWith('/modify')) return Response.json({ id: 'abc123', labelIds: ['INBOX'] });
    if (init?.method === 'PATCH' && url.pathname.endsWith('/messages/outlook-id')) return Response.json({ id: 'outlook-id', isRead: true });
    if (url.pathname.endsWith('/messages/outlook-id')) return Response.json({ id: 'outlook-id', subject: 'Outlook mail', bodyPreview: 'Hello', isRead: false, body: { content: '<p>Microsoft <img src="https://example.com/pixel.png"></p>' } });
    if (url.pathname.endsWith('/attachments/test-attachment')) return Response.json({ data: Buffer.from('png-test').toString('base64url'), size: 8 });
    if (url.hostname === 'graph.microsoft.com' && url.pathname.endsWith('/messages')) return Response.json({ value: [{ id: 'outlook-id', subject: 'Outlook mail', bodyPreview: 'hello', isRead: true }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=20' });
    if (url.pathname.endsWith('/messages')) return Response.json({ messages: [{ id: 'abc123' }], nextPageToken: 'page-2' });
    if (url.pathname.endsWith('/messages/abc123')) return Response.json({ id: 'abc123', threadId: 'gmail-thread-1', internalDate: '1700000000000', labelIds: ['UNREAD', 'STARRED'], snippet: 'Test email', payload: {
      mimeType: 'multipart/mixed', headers: [
        { name: 'From', value: 'Sender <sender@example.test>' }, { name: 'To', value: 'alice@example.test' },
        { name: 'Subject', value: 'Olá' }, { name: 'Message-ID', value: '<original@example.test>' },
        { name: 'References', value: '<parent@example.test>' },
      ],
      parts: [
        { mimeType: 'multipart/alternative', parts: [
          { mimeType: 'text/html', body: { data: Buffer.from('<p>Texto com imagem <img src="cid:picture-1"></p><script>alert(1)</script>').toString('base64url') } },
          { mimeType: 'text/plain', body: { data: Buffer.from('Mensagem em texto').toString('base64url') } },
        ] },
        { mimeType: 'image/png', headers: [{ name: 'Content-ID', value: '<picture-1>' }], body: { attachmentId: 'test-attachment', size: 8 } },
      ],
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
function notificationRequest(path,{user=alice,method='GET',body,origin='http://localhost:5173'}={}){
  return app.inject({method,url:'/api/v1/notifications'+path,
    headers:{...(user?{'x-test-user':user}:{}),...(origin?{origin}:{})},
    ...(body?{payload:body}:{})});
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
async function legacyOutlook() {
  // Direct Graph connections and older stored Microsoft tokens share the same schema.
  const encrypted = sealMailSecret(JSON.stringify({
    access_token: 'test-access', refresh_token: 'test-refresh', expires_at: Date.now() + 60_000 * 60,
  }));
  await getPool().query(
    "INSERT INTO mail_connections (user_id,provider,email,tokens) VALUES ($1,'outlook',$2,$3) ON CONFLICT (user_id,provider,email) DO UPDATE SET tokens=excluded.tokens",
    [alice,'alice@outlook.test',encrypted]);
  return (await request('accounts')).json().accounts.find(row => row.provider === 'outlook');
}
test('OAuth starts for both Gmail and Outlook, and preserves distinct accounts', async () => {
  const outlookUrl=await start('outlook');
  assert.equal(outlookUrl.hostname,'login.microsoftonline.com');
  assert.equal(outlookUrl.pathname,'/common/oauth2/v2.0/authorize');
  assert.equal(outlookUrl.searchParams.get('code_challenge_method'),'S256');
  assert.equal(outlookUrl.searchParams.get('redirect_uri'),'http://localhost:5173/api/v1/mail/oauth/outlook/callback');
  const scopes=outlookUrl.searchParams.get('scope')??'';
  for(const scope of ['offline_access','User.Read','Mail.ReadWrite','Mail.Send'])
    assert.ok(scopes.includes(scope),'Microsoft permission '+scope+' is requested');
  const outlook=await connect('outlook');
  assert.equal(outlook.email,'alice@outlook.test');
  const first = await connect();
  gmailEmail = 'alice-second@example.test';
  try { await connect(); }
  finally { gmailEmail = 'alice@example.test'; }
  const list = (await request('accounts')).json();
  assert.equal(list.providers.find(p=>p.id==='outlook')?.configured,true);
  assert.ok(list.accounts.some(a => a.id === first.id));
  assert.ok(list.accounts.some(a => a.email === 'alice-second@example.test'));
  assert.equal(list.accounts.filter(a=>a.provider==='gmail').length, 2);
  assert.ok(list.accounts.some(a=>a.id===outlook.id));
});
test('Outlook OAuth is fail-closed when Microsoft credentials are missing', async () => {
  const old=process.env.MAIL_MICROSOFT_CLIENT_SECRET;
  delete process.env.MAIL_MICROSOFT_CLIENT_SECRET;
  try{
    const status=(await request('accounts')).json();
    assert.equal(status.providers.find(p=>p.id==='outlook')?.configured,false);
    const blocked=await request('oauth/outlook',{method:'POST',body:{}});
    assert.equal(blocked.statusCode,503);
    assert.equal(blocked.json().error,'MAIL_NOT_CONFIGURED');
    assert.equal((await request('oauth/gmail',{method:'POST',body:{}})).statusCode,200,
      'missing Microsoft configuration must not affect Gmail');
  }finally{if(old===undefined)delete process.env.MAIL_MICROSOFT_CLIENT_SECRET;
    else process.env.MAIL_MICROSOFT_CLIENT_SECRET=old;}
});
test('manual server config validates fields without exposing passwords', async () => {
  const valid = { email: 'me@company.example.com', imapHost: 'imap.service.invalid',
    imapPort: 993, smtpHost: 'smtp.example.com', smtpPort: 587,
    username: 'me@company.example.com', password: 'private-app-secret' };
  const noAuth = await request('manual', { method: 'POST', body: valid, user: null });
  assert.equal(noAuth.statusCode, 401);
  assert.equal((await request('manual', { method: 'POST', body: valid, origin:'https://evil.test' })).statusCode, 403);
  const wrongPort = await request('manual', { method: 'POST', body: {...valid, imapPort: 143} });
  assert.equal(wrongPort.statusCode, 400);
  const bad = await request('manual', { method: 'POST', body: {...valid, password: ''} });
  assert.equal(bad.statusCode, 400);
  const local = await request('manual', { method: 'POST', body: valid });
  assert.equal(local.statusCode, 503);
  assert.ok(!JSON.stringify(local.json()).includes('private-app-secret'));
});
test('selected messages move to spam/trash only for owner, valid origin and bounded IDs', async () => {
  const account = await connect();
  const path = 'accounts/' + account.id + '/messages/move';
  const sample = { ids: ['abc123'], destination: 'spam' };
  assert.equal((await request(path, {method:'POST',user:bob,body:sample})).statusCode,404);
  assert.equal((await request(path, {method:'POST',origin:'https://evil.test',body:sample})).statusCode,403);
  assert.equal((await request(path, {method:'POST',body:{...sample,destination:'delete_forever'}})).statusCode,400);
  assert.equal((await request(path, {method:'POST',body:{...sample,ids:Array.from({length:101},(_,i)=>'id'+i)}})).statusCode,400);
  calls=[];
  const result = await request(path, {method:'POST',body:sample});
  assert.equal(result.statusCode,200);assert.deepEqual(result.json(),{moved:['abc123'],failed:[]});
  const operation = calls.find(c=>c.url.pathname.endsWith('/batchModify'));
  assert.ok(operation);assert.deepEqual(JSON.parse(operation.init.body),{ids:['abc123'],addLabelIds:['SPAM'],removeLabelIds:['INBOX','TRASH']});
  calls=[];
  assert.equal((await request(path, {method:'POST',body:{...sample,destination:'trash'}})).statusCode,200);
  assert.deepEqual(JSON.parse(calls.find(c=>c.url.pathname.endsWith('/batchModify')).init.body),{ids:['abc123'],addLabelIds:['TRASH'],removeLabelIds:['INBOX','SPAM']});
});
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
  assert.ok(url.searchParams.get('scope').includes('https://www.googleapis.com/auth/gmail.modify'));
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:5173/api/v1/mail/oauth/gmail/callback');
  assert.equal((await request('accounts')).json().webOrigin, 'http://localhost:5173');
  const wrongUser = await request('oauth/gmail/callback?state=' + state + '&code=test', { user: bob });
  assert.match(wrongUser.headers.location, /mail=failed&mail_reason=state/);
  const valid = await request('oauth/gmail/callback?state=' + state + '&code=test'); assert.match(valid.headers.location, /mail=connected/);
  const replay = await request('oauth/gmail/callback?state=' + state + '&code=test'); assert.match(replay.headers.location, /mail=failed&mail_reason=state/);
  const outlookUrl=await start('outlook');
  const microsoftState=outlookUrl.searchParams.get('state');
  const crossProvider=await request('oauth/gmail/callback?state='+microsoftState+'&code=test');
  assert.match(crossProvider.headers.location,/mail=failed&mail_reason=state/);
  const crossUser=await request('oauth/outlook/callback?state='+microsoftState+'&code=test',{user:bob});
  assert.match(crossUser.headers.location,/mail=failed&mail_reason=state/);
  const accepted=await request('oauth/outlook/callback?state='+microsoftState+'&code=test');
  assert.match(accepted.headers.location,/mail=connected/);
  assert.match(accepted.headers.location,/mail_provider=outlook/);
  assert.doesNotMatch(accepted.headers.location,/test-access|test-refresh|state=/);
  const microsoftReplay=await request('oauth/outlook/callback?state='+microsoftState+'&code=test');
  assert.match(microsoftReplay.headers.location,/mail=failed&mail_reason=state/);
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
  assert.equal(detail.json().body, 'Mensagem em texto');
  assert.match(detail.json().html, /data:image\/png;base64,/);
  assert.ok(!detail.json().html.includes('cid:picture-1'));
  assert.equal(detail.headers['cache-control'], 'private, no-store');
  const forbidden = await request('accounts/' + account.id, { user: bob, method: 'DELETE' }); assert.equal(forbidden.statusCode, 200);
  assert.equal((await request('accounts/' + account.id + '/messages')).statusCode, 200);
});

test('Gmail spam, trash and read-only-folder views are scoped to the connected mailbox', async () => {
  const account = await connect();
  calls = [];
  assert.equal((await request('accounts/' + account.id + '/messages?folder=spam')).statusCode, 200);
  assert.equal((await request('accounts/' + account.id + '/messages?folder=trash')).statusCode, 200);
  const lists = calls.filter(c => c.url.hostname === 'gmail.googleapis.com' && c.url.pathname.endsWith('/messages'));
  assert.equal(lists[0].url.searchParams.get('labelIds'), 'SPAM');
  assert.equal(lists[0].url.searchParams.get('includeSpamTrash'), 'true');
  assert.equal(lists[1].url.searchParams.get('labelIds'), 'TRASH');
  assert.equal(lists[1].url.searchParams.get('includeSpamTrash'), 'true');
  assert.equal((await request('accounts/' + account.id + '/messages?folder=unknown')).statusCode, 400);
});
test('marking a Gmail email read sends UNREAD removal only for the owner and trusted origin', async () => {
  const account = await connect();
  const path = 'accounts/' + account.id + '/messages/abc123/read';
  assert.equal((await request(path, { method: 'POST', user: bob })).statusCode, 404);
  assert.equal((await request(path, { method: 'POST', origin: 'https://evil.test' })).statusCode, 403);
  calls = [];
  assert.equal((await request(path, { method: 'POST' })).statusCode, 200);
  const change = calls.find(c => c.url.pathname.endsWith('/messages/abc123/modify'));
  assert.ok(change);
  assert.deepEqual(JSON.parse(change.init.body), { removeLabelIds: ['UNREAD'] });
  assert.equal(change.init.method, 'POST');
});
test('Gmail replies go to the server-verified sender and same thread, not client-controlled addresses', async () => {
  const account = await connect();
  const path = 'accounts/' + account.id + '/messages/abc123/reply';
  assert.equal((await request(path, { method: 'POST', user: bob, body: { body: 'Hello!' } })).statusCode, 404);
  assert.equal((await request(path, { method: 'POST', origin: 'https://evil.test', body: { body: 'Hello!' } })).statusCode, 403);
  assert.equal((await request(path, { method: 'POST', body: { body: '  ' } })).statusCode, 400);
  assert.equal((await request(path, { method: 'POST', body: { body: 'Hello!', to: 'attacker@example.test' } })).statusCode, 400);
  calls = [];
  const reply = await request(path, { method: 'POST', body: { body: 'Obrigado, recebido!' } });
  assert.equal(reply.statusCode, 200, 'Mailbox provider paths: ' + calls.map(c => c.url.pathname).join(' | '));
  const sent = calls.find(c => c.url.pathname.endsWith('/send'));
  assert.ok(sent);
  const payload = JSON.parse(sent.init.body);
  assert.equal(payload.threadId, 'gmail-thread-1');
  const raw = Buffer.from(payload.raw, 'base64url').toString('utf8');
  assert.match(raw, /To: sender@example.test/);
  assert.match(raw, /In-Reply-To: <original@example.test>/);
  assert.match(raw, /References: <parent@example.test> <original@example.test>/);
  assert.doesNotMatch(raw, /attacker@example.test/);
});
test('Outlook spam, trash, read status and reply use Microsoft Graph', async () => {
  const account = await legacyOutlook();
  calls = [];
  for (const [folder, knownName] of [['spam', 'junkemail'], ['trash', 'deleteditems']]) {
    assert.equal((await request('accounts/' + account.id + '/messages?folder=' + folder)).statusCode, 200);
    assert.ok(calls.some(c => c.url.pathname.includes('/mailFolders/' + knownName + '/messages')));
  }
  assert.equal((await request('accounts/' + account.id + '/messages/outlook-id')).statusCode, 200);
  const detail = (await request('accounts/' + account.id + '/messages/outlook-id')).json();
  assert.match(detail.html, /Microsoft/);
  calls = [];
  assert.equal((await request('accounts/' + account.id + '/messages/outlook-id/read', { method: 'POST' })).statusCode, 200);
  assert.ok(calls.some(c => c.url.pathname.endsWith('/messages/outlook-id') && c.init.method === 'PATCH' && JSON.parse(c.init.body).isRead === true));
  calls = [];
  assert.equal((await request('accounts/' + account.id + '/messages/outlook-id/reply', { method: 'POST', body: { body: 'My answer' } })).statusCode, 200);
  assert.ok(calls.some(c => c.url.pathname.endsWith('/messages/outlook-id/reply') && JSON.parse(c.init.body).comment === 'My answer'));
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
  const account = await legacyOutlook(); calls = [];
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

test('email notification inbox supports ownership, read, delete and mailbox cascade',async()=>{
  const account=await connect('gmail');
  const messageId='new-mail-2026';
  const inserted=await getPool().query(
    "INSERT INTO notification_inbox_events(recipient_id,kind,event_key,mail_account_id,mail_message_id,sender,subject) "+
    "VALUES($1,'email',$2,$3,$4,$5,$6) RETURNING id",
    [alice,'email:'+account.id+':'+messageId,account.id,messageId,'Sender <sender@example.test>','Hello from Gmail']);
  const id=inserted.rows[0].id;
  assert.equal((await notificationRequest('/inbox-events',{user:null})).statusCode,401);
  const owner=await notificationRequest('/inbox-events');
  assert.equal(owner.statusCode,200,owner.body);
  const event=owner.json().events.find(item=>item.id===id);
  assert.equal(event.mailAccountId,account.id);
  assert.equal(event.mailMessageId,messageId);
  assert.equal(event.mailAddress,account.email);
  assert.equal(event.subject,'Hello from Gmail');
  assert.equal((await notificationRequest('/inbox-events',{user:bob})).json().events.some(item=>item.id===id),false);
  assert.equal((await notificationRequest('/inbox-events/'+id+'/read',{user:bob,method:'PATCH'})).statusCode,404);
  assert.equal((await notificationRequest('/inbox-events/'+id+'/read',{method:'PATCH',origin:'https://untrusted.example'})).statusCode,403);
  assert.equal((await notificationRequest('/inbox-events/'+id+'/read',{method:'PATCH'})).statusCode,200);
  assert.ok((await notificationRequest('/inbox-events')).json().events.find(item=>item.id===id).readAt);
  assert.equal((await notificationRequest('/inbox-events/'+id,{user:bob,method:'DELETE'})).statusCode,404);
  assert.equal((await notificationRequest('/inbox-events/read-all',{method:'POST'})).statusCode,200);
  assert.equal((await notificationRequest('/inbox-events/'+id,{method:'DELETE'})).statusCode,200);
  assert.equal((await notificationRequest('/inbox-events')).json().events.some(item=>item.id===id),false);

  const second=await getPool().query(
    "INSERT INTO notification_inbox_events(recipient_id,kind,event_key,mail_account_id,mail_message_id) "+
    "VALUES($1,'email',$2,$3,$4) RETURNING id",
    [alice,'email:'+account.id+':another',account.id,'another']);
  const cascade=second.rows[0].id;
  assert.equal((await request('accounts/'+account.id,{method:'DELETE'})).statusCode,200);
  assert.equal((await notificationRequest('/inbox-events')).json().events.some(item=>item.id===cascade),false,
    'disconnecting the mailbox removes its notification data');
});
