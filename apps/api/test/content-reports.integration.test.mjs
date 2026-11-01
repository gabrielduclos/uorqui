import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const base = 'http://127.0.0.1:3070';
const origin = 'http://localhost:5173';
let server;

before(async () => {
  server = spawn(process.execPath, ['apps/api/dist/server.js'], {
    cwd: process.cwd(), stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'test', ENABLE_DEV_SIGNUP: 'true',
      AUTH_BASE_URL: base, WEB_ORIGIN: origin, HOST: '127.0.0.1', PORT: '3070' },
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error('Content report server exited');
    try { if ((await fetch(base + '/health/ready')).ok) return; } catch {}
    await delay(200);
  }
  throw Error('Content report server timed out');
});
after(async () => {
  if (server?.exitCode === null) {
    server.kill('SIGTERM'); await delay(300);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
});

function visitor() {
  let cookie = '';
  return async (path, method = 'GET', payload, withOrigin = true) => {
    const response = await fetch(base + path, {
      method, headers: {
        ...(withOrigin ? { origin } : {}),
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    for (const value of response.headers.getSetCookie()) {
      const [entry] = value.split(';');
      const key = entry.split('=')[0];
      cookie = [...cookie.split(';').filter(Boolean).filter(x => x.split('=')[0] !== key),entry].join('; ');
    }
    return { status: response.status, data: await response.json().catch(() => null) };
  };
}

const alice = visitor(), bob = visitor(), outsider = visitor(), anonymous = visitor();
async function signup(user, handle) {
  const sign = await user('/api/auth/sign-up/email', 'POST', {
    name: handle, email: handle + '@example.invalid', password: 'correct-horse-battery-staple-reports',
  });
  assert.equal(sign.status, 200, JSON.stringify(sign.data));
  const onboard = await user('/api/v1/onboarding', 'POST', { handle, displayName: handle });
  assert.equal(onboard.status, 201, JSON.stringify(onboard.data));
}

test('reports: three kinds, access checks, origin, duplicate and durable evidence', async () => {
  await signup(alice, 'report_alice');
  await signup(bob, 'report_bob');
  await signup(outsider, 'report_outsider');
  const post = await alice('/api/v1/feed/posts', 'POST', { body: 'Flagged original post', mediaCount: 0 });
  assert.equal(post.status, 201, JSON.stringify(post.data));
  const postId = post.data.post.id;
  const postReport = { targetKind: 'post', targetId: postId, reason: 'spam', details: ' Please review this ' };
  assert.equal((await anonymous('/api/v1/reports', 'POST', postReport)).status, 401);
  assert.equal((await bob('/api/v1/reports', 'POST', postReport, false)).status, 403);
  assert.equal((await bob('/api/v1/reports', 'POST', { ...postReport, reason: 'invalid' })).status, 400);
  assert.equal((await bob('/api/v1/reports', 'POST', { ...postReport, targetId: 'invalid' })).status, 400);
  assert.equal((await alice('/api/v1/reports', 'POST', postReport)).status, 404, 'cannot report own post');
  assert.equal((await bob('/api/v1/reports', 'POST', postReport)).status, 201);
  assert.equal((await bob('/api/v1/reports', 'POST', postReport)).status, 409, 'same person cannot file twice');

  const conversation = await alice('/api/v1/dm/conversations', 'POST', { handle: 'report_bob' });
  assert.equal(conversation.status, 200, JSON.stringify(conversation.data));
  const msg = await alice('/api/v1/dm/conversations/' + conversation.data.id + '/messages', 'POST', {
    clientId: randomUUID(), body: 'Flagged direct message',
  });
  assert.equal(msg.status, 201, JSON.stringify(msg.data));
  const dmReport = { targetKind: 'direct_message', targetId: msg.data.message.id, reason: 'harassment' };
  assert.equal((await outsider('/api/v1/reports', 'POST', dmReport)).status, 404, 'stranger cannot report private DM');
  assert.equal((await alice('/api/v1/reports', 'POST', dmReport)).status, 404, 'cannot report own message');
  assert.equal((await bob('/api/v1/reports', 'POST', dmReport)).status, 201);

  const group = await alice('/api/v1/communities', 'POST', {
    name: 'Reporting test', slug: 'content-report-test', visibility: 'public',
  });
  assert.equal(group.status, 201, JSON.stringify(group.data));
  const id = group.data.id;
  assert.equal((await bob('/api/v1/communities/' + id + '/join', 'POST')).status, 200);
  const detail = await bob('/api/v1/communities/' + id);
  const channel = detail.data.channels.find(item => item.kind === 'text');
  assert.ok(channel);
  const channelMsg = await alice('/api/v1/communities/' + id + '/channels/' + channel.id + '/messages', 'POST', {
    clientId: randomUUID(), body: 'Flagged channel message',
  });
  assert.equal(channelMsg.status, 201, JSON.stringify(channelMsg.data));
  const communityReport = { targetKind: 'community_message', targetId: channelMsg.data.id, reason: 'hate' };
  assert.equal((await outsider('/api/v1/reports', 'POST', communityReport)).status, 404, 'nonmember cannot report channel content');
  assert.equal((await alice('/api/v1/reports', 'POST', communityReport)).status, 404, 'cannot report own channel message');
  assert.equal((await bob('/api/v1/reports', 'POST', communityReport)).status, 201);

  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const result = await db.query(
      'SELECT target_kind, reason, details, evidence, status FROM content_reports WHERE target_id=ANY($1::uuid[]) ORDER BY target_kind',
      [[postId, msg.data.message.id, channelMsg.data.id]],
    );
    assert.equal(result.rows.length, 3);
    const byKind = Object.fromEntries(result.rows.map(row => [row.target_kind, row]));
    assert.deepEqual(Object.keys(byKind).sort(), ['community_message', 'direct_message', 'post']);
    assert.equal(byKind.post.evidence.body, 'Flagged original post');
    assert.equal(byKind.post.details, 'Please review this');
    assert.equal(byKind.direct_message.evidence.body, 'Flagged direct message');
    assert.equal(byKind.community_message.evidence.body, 'Flagged channel message');
    assert.ok(result.rows.every(item => item.status === 'pending'));
  } finally { await db.end(); }
});
