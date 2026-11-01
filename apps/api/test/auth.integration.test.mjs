import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

const url = 'http://127.0.0.1:3001';
const origin = 'http://localhost:5173';
let server;
let startupErrors = '';
let cookie = '';

before(async () => {
  server = spawn(process.execPath, ['apps/api/dist/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      AUTH_BASE_URL: 'http://127.0.0.1:3001',
      WEB_ORIGIN: origin,
      ENABLE_DEV_SIGNUP: 'true',
      PORT: '3001',
    },
    stdio: ['ignore','ignore','pipe'],
  });

  server.stderr?.on('data', chunk => {startupErrors=(startupErrors+String(chunk)).slice(-6000);});
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) break;
    try {
      const result = await fetch(url + '/health');
      if (result.ok) { ready = true; break; }
    } catch { /* waiting for startup */ }
    await sleep(250);
  }
  assert.ok(ready, 'Fastify server did not start: '+startupErrors);
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await sleep(500);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
});

async function send(path, { method = 'GET', body, useCookie = true } = {}) {
  const response = await fetch(url + path, {
    method,
    redirect: 'manual',
    headers: {
      origin,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie && useCookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const setCookies = response.headers.getSetCookie();
  if (setCookies.length) {
    const values = setCookies.map((c) => c.split(';')[0]).filter(Boolean);
    cookie = [...new Map([...cookie.split(';').map(s => s.trim()).filter(Boolean), ...values].map(v => [v.split('=')[0], v])).values()].join('; ');
  }
  return { response, data: await response.json().catch(() => null) };
}

test('Auth + social profile local integration', async () => {
  const health = await send('/health/db');
  assert.equal(health.response.status, 200, 'db health');
  assert.equal(health.data.schema, 'ready');

  const status = await send('/api/v1/status');
  assert.equal(status.response.status, 200);
  assert.equal(status.data.publicRegistration, false);
  assert.equal(status.data.registrationAvailable, true);
  assert.equal(status.data.emailVerificationRequired, false);
  assert.equal(status.data.developmentRegistrationEnabled, true);

  const blocked = await send('/api/v1/me', { useCookie: false });
  assert.equal(blocked.response.status, 401, 'anonymous request denied');

  const signup = await send('/api/auth/sign-up/email', {
    method: 'POST',
    body: {
      name: 'Uorqui Test',
      email: 'uorqui-test@example.invalid',
      password: 'correct-horse-battery-staple-demo',
    },
  });
  assert.equal(signup.response.status, 200, JSON.stringify(signup.data));
  assert.ok(cookie, 'sign-up should set a cookie');

  const me = await send('/api/v1/me');
  assert.equal(me.response.status, 200, JSON.stringify(me.data));
  assert.equal(me.data.user.email, 'uorqui-test@example.invalid');
  assert.equal(me.data.profile, null);

  const invalid = await send('/api/v1/onboarding', {
    method: 'POST',
    body: { handle: '!', displayName: 'Test User' },
  });
  assert.equal(invalid.response.status, 400);

  const profile = await send('/api/v1/onboarding', {
    method: 'POST',
    body: { handle: 'uorqui_tester', displayName: 'Test User' },
  });
  assert.equal(profile.response.status, 201, JSON.stringify(profile.data));

  const profileRead = await send('/api/v1/me');
  assert.equal(profileRead.response.status, 200);
  assert.equal(profileRead.data.profile.handle, 'uorqui_tester');

  // Public profiles must be accessible without cookies but never expose email.
  const publicRead = await send('/api/v1/profiles/uorqui_tester', { useCookie: false });
  assert.equal(publicRead.response.status, 200, JSON.stringify(publicRead.data));
  assert.equal(publicRead.data.profile.handle, 'uorqui_tester');
  assert.equal(publicRead.data.profile.displayName, 'Test User');
  assert.equal(publicRead.data.profile.email, undefined);

  const search = await send('/api/v1/profiles/search?q=tester', { useCookie: false });
  assert.equal(search.response.status, 200);
  assert.ok(search.data.results.some(person => person.handle === 'uorqui_tester'));
  assert.equal(search.data.results[0].email, undefined);

  const unauthorizedUpdate = await send('/api/v1/me/profile', {
    method: 'PATCH', useCookie: false, body: { bio: 'Not authorized' },
  });
  assert.equal(unauthorizedUpdate.response.status, 401);

  const badAvatar = await send('/api/v1/me/profile', {
    method: 'PATCH', body: { avatarUrl: 'javascript:alert(1)' },
  });
  assert.equal(badAvatar.response.status, 400, 'reject non-HTTPS images');

  const update = await send('/api/v1/me/profile', {
    method: 'PATCH',
    body: {
      displayName: 'Changed Name', bio: 'Playing games and building tools.',
      avatarUrl: 'https://example.com/photo.png',
      coverUrl: 'https://example.com/cover.png',
      isPublic: false,
    },
  });
  assert.equal(update.response.status, 200, JSON.stringify(update.data));
  assert.equal(update.data.profile.isPublic, false);
  assert.equal(update.data.profile.bio, 'Playing games and building tools.');

  const hidden = await send('/api/v1/profiles/uorqui_tester', { useCookie: false });
  assert.equal(hidden.response.status, 404, 'private profile must not be public');
  const hiddenSearch = await send('/api/v1/profiles/search?q=tester', { useCookie: false });
  assert.ok(!hiddenSearch.data.results.some(person => person.handle === 'uorqui_tester'));

  const ownerRead = await send('/api/v1/me');
  assert.equal(ownerRead.response.status, 200);
  assert.equal(ownerRead.data.profile.avatarUrl, 'https://example.com/photo.png');
  assert.equal(ownerRead.data.profile.isPublic, false);

  const visibleAgain = await send('/api/v1/me/profile', {
    method: 'PATCH', body: { isPublic: true, handle: 'new_tester' },
  });
  assert.equal(visibleAgain.response.status, 200, JSON.stringify(visibleAgain.data));
  assert.equal(visibleAgain.data.profile.handle, 'new_tester');

  const oldLink = await send('/api/v1/profiles/uorqui_tester', { useCookie: false });
  assert.equal(oldLink.response.status, 404);
  const newLink = await send('/api/v1/profiles/new_tester', { useCookie: false });
  assert.equal(newLink.response.status, 200);

  const duplicate = await send('/api/v1/onboarding', {
    method: 'POST',
    body: { handle: 'uorqui_tester', displayName: 'Again' },
  });
  assert.equal(duplicate.response.status, 409);

  // Invalid credentials must not authenticate another caller.
  const badSignIn = await send('/api/auth/sign-in/email', {
    method: 'POST',
    useCookie: false,
    body: { email: 'uorqui-test@example.invalid', password: 'completely-incorrect-password' },
  });
  assert.equal(badSignIn.response.ok, false, 'wrong password should not succeed');

  const logout = await send('/api/auth/sign-out', { method: 'POST', body: {} });
  assert.equal(logout.response.status, 200, JSON.stringify(logout.data));

  const noSession = await send('/api/v1/me', { useCookie: false });
  assert.equal(noSession.response.status, 401);

  const afterLogout = await send('/api/v1/me');
  assert.equal(afterLogout.response.status, 401, 'signed-out session must be rejected');

});
