import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';

// E2E checks use PostgreSQL in GitHub Actions, never credentials from Neon.
// The real Wrangler development runtime proxies requests to the real Fastify API.
const API_PORT = 3015;
const WORKER_PORT = 8787;
const browserOrigin = `http://127.0.0.1:${WORKER_PORT}`;
const apiOrigin = `http://127.0.0.1:${API_PORT}`;

async function waitFor(url, child, name) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`${name} exited during startup: ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* startup */ }
    await wait(300);
  }
  throw new Error(`${name} did not become healthy: ${url}`);
}

function terminate(child) {
  if (child && child.exitCode === null && !child.killed) child.kill('SIGTERM');
}

test('Cloudflare Worker reverse proxy preserves authentication cookies and rejects anonymous access', { timeout: 120_000 }, async () => {
  const service = spawn(process.execPath, ['apps/api/dist/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ENABLE_DEV_SIGNUP: 'true',
      AUTH_BASE_URL: browserOrigin,
      WEB_ORIGIN: browserOrigin,
      HOST: '127.0.0.1',
      PORT: String(API_PORT),
    },
    stdio: 'ignore',
  });
  let worker;
  try {
    await waitFor(apiOrigin + '/health/db', service, 'Fastify');

    // npx is available from setup-node; wrangler is installed as web dependency.
    worker = spawn('npx', [
      'wrangler', 'dev',
      '--ip', '127.0.0.1',
      '--port', String(WORKER_PORT),
      '--var', `API_ORIGIN:${apiOrigin}`,
    ], {
      cwd: resolve(process.cwd(), 'apps/web'),
      env: { ...process.env, CI: 'true' },
      stdio: 'ignore',
    });

    await waitFor(browserOrigin + '/api/v1/status', worker, 'Cloudflare Worker');

    let cookie = '';
    async function request(path, options = {}) {
      const response = await fetch(browserOrigin + path, {
        method: options.method ?? 'GET',
        headers: {
          origin: browserOrigin,
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        redirect: 'manual',
      });
      const newCookies = response.headers.getSetCookie()
        .map(value => value.split(';')[0]).filter(Boolean);
      if (newCookies.length) {
        const jar = new Map(cookie.split(';').map(x => x.trim()).filter(Boolean).map(x => [x.split('=')[0], x]));
        for (const next of newCookies) jar.set(next.split('=')[0], next);
        cookie = [...jar.values()].join('; ');
      }
      return { response, body: await response.json().catch(() => null) };
    }

    const readiness = await request('/health/ready');
    assert.equal(readiness.response.status, 200, JSON.stringify(readiness.body));
    assert.equal(readiness.body.status, 'ready');

    const status = await request('/api/v1/status');
    assert.equal(status.response.status, 200);
    assert.equal(status.body.project, 'uorqui');

    const anon = await request('/api/v1/me');
    assert.equal(anon.response.status, 401);

    const signup = await request('/api/auth/sign-up/email', {
      method: 'POST',
      body: {
        name: 'Cloudflare Integration Test',
        email: 'worker-proxy-ci@example.invalid',
        password: 'correct-horse-battery-staple-ci',
      },
    });
    assert.equal(signup.response.status, 200, JSON.stringify(signup.body));
    assert.ok(cookie, 'proxy must forward the Better Auth Set-Cookie header');

    const me = await request('/api/v1/me');
    assert.equal(me.response.status, 200, JSON.stringify(me.body));
    assert.equal(me.body.user.email, 'worker-proxy-ci@example.invalid');

    const profile = await request('/api/v1/onboarding', {
      method: 'POST',
      body: { handle: 'worker_ci', displayName: 'Worker CI' },
    });
    assert.equal(profile.response.status, 201, JSON.stringify(profile.body));

    const read = await request('/api/v1/me');
    assert.equal(read.response.status, 200);
    assert.equal(read.body.profile.handle, 'worker_ci');

    const logout = await request('/api/auth/sign-out', { method: 'POST', body: {} });
    assert.equal(logout.response.status, 200, JSON.stringify(logout.body));

    const after = await request('/api/v1/me');
    assert.equal(after.response.status, 401, 'logged-out cookie cannot access protected profile');

    const apiHealth = await request('/health/db');
    assert.equal(apiHealth.response.status, 200);
    assert.equal(apiHealth.body.schema, 'ready');
  } finally {
    terminate(worker);
    terminate(service);
    await wait(500);
    if (worker && worker.exitCode === null) worker.kill('SIGKILL');
    if (service.exitCode === null) service.kill('SIGKILL');
  }
});
