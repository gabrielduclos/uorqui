import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

test('production never allows self-registration, even when dev flag is true', async () => {
  const base = 'http://127.0.0.1:3012';
  const publicOrigin = 'https://main.uorqui1.workers.dev';
  const server = spawn(process.execPath, ['apps/api/dist/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ENABLE_DEV_SIGNUP: 'true',
      AUTH_BASE_URL: publicOrigin,
      WEB_ORIGIN: publicOrigin,
      // Keep CI test process accessible only on localhost.
      HOST: '127.0.0.1',
      PORT: '3012',
    },
    stdio: 'ignore',
  });

  try {
    let alive = false;
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) break;
      try {
        const res = await fetch(base + '/api/v1/status');
        if (res.ok) { alive = true; break; }
      } catch { /* waiting on Fastify */ }
      await sleep(200);
    }
    assert.ok(alive, 'API should start in production mode');

    const status = await (await fetch(base + '/api/v1/status')).json();
    assert.equal(status.publicRegistration, false);
    assert.equal(status.developmentRegistrationEnabled, false);

    const db = await fetch(base + '/health/db');
    assert.equal(db.status, 200, 'production API should connect to test PostgreSQL');
    const readiness = await fetch(base + '/health/ready');
    assert.equal(readiness.status, 200, 'production readiness requires auth config and a ready database');

    const signup = await fetch(base + '/api/auth/sign-up/email', {
      method: 'POST',
      headers: { origin: publicOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Blocked User',
        email: 'production-blocked@example.invalid',
        password: 'more-than-twelve-characters',
      }),
    });
    assert.equal(signup.ok, false, 'public sign-up must be disabled in production');
    assert.equal(signup.headers.getSetCookie().length, 0, 'rejected sign-up cannot create a session');
  } finally {
    server.kill('SIGTERM');
    await sleep(400);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
});
