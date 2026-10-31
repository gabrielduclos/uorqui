import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

test('registration is rejected when the development flag is off', async () => {
  const origin = 'http://localhost:5173';
  const base = 'http://127.0.0.1:3002';
  const server = spawn(process.execPath, ['apps/api/dist/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      AUTH_BASE_URL: base,
      WEB_ORIGIN: origin,
      ENABLE_DEV_SIGNUP: 'false',
      PORT: '3002',
    },
    stdio: 'ignore',
  });

  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) break;
      try {
        const response = await fetch(base + '/api/v1/status');
        if (response.ok) { ready = true; break; }
      } catch { /* server starting */ }
      await sleep(200);
    }
    assert.ok(ready, 'API did not start');

    const status = await (await fetch(base + '/api/v1/status')).json();
    assert.equal(status.publicRegistration, false);
    assert.equal(status.developmentRegistrationEnabled, false);

    const response = await fetch(base + '/api/auth/sign-up/email', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Should Not Register',
        email: 'blocked-signup@example.invalid',
        password: 'minimum-12-characters-for-test',
      }),
    });

    assert.equal(response.ok, false, 'signup must be blocked by the backend');
    assert.equal(response.headers.getSetCookie().length, 0, 'denied signup must not establish a session');
  } finally {
    server.kill('SIGTERM');
    await sleep(400);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
});
