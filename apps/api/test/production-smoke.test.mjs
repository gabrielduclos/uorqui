import assert from 'node:assert/strict';
import { test } from 'node:test';

// Read-only health checks and *invalid* Turnstile challenges only.
// Never send a real production registration or email from CI.
const frontend = 'https://main.uorqui1.workers.dev';
const backend = 'https://uorqui-social-api.onrender.com';

async function request(base, path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(35_000),
    headers: { accept: 'application/json', ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}
async function ready(base) {
  let last;
  for (let i = 0; i < 3; i += 1) {
    try {
      last = await request(base, '/health/ready');
      if (last.status === 200) return last;
    } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  assert.fail('API not ready: ' + JSON.stringify(last));
}
const invalidChallenge = {
  name: 'Uorqui CI Rejected Challenge',
  email: 'rejected-challenge-uorqui-ci@example.invalid',
  password: 'CI-rejected-challenge-2026-10-31',
  captchaToken: 'invalid-turnstile-token-do-not-accept',
};
function post(path, payload, base = frontend) {
  return request(base, path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: frontend },
    body: JSON.stringify(payload),
  });
}

test('live Cloudflare proxy, Render API and Neon are ready', { timeout: 120_000 }, async () => {
  const api = await ready(backend);
  const worker = await ready(frontend);
  assert.equal(api.data.status, 'ready');
  assert.equal(worker.data.status, 'ready');
  const db = await request(frontend, '/health/db');
  assert.equal(db.status, 200, JSON.stringify(db.data));
  assert.equal(db.data.schema, 'ready');
});

test('production signup configuration and anonymous profile', { timeout: 120_000 }, async () => {
  const r = await request(frontend, '/api/v1/status');
  assert.equal(r.status, 200);
  assert.equal(r.data.project, 'uorqui');
  const enabled = r.data.publicRegistration === true;
  if (process.env.EXPECT_PUBLIC_REGISTRATION === 'true') {
    assert.equal(enabled, true, 'Public signup must be enabled for release');
    assert.equal(r.data.registrationAvailable, true);
    assert.equal(r.data.emailVerificationRequired, true);
    assert.equal(r.data.passwordRecoveryAvailable, true);
    assert.ok(/^0x[A-Za-z0-9_-]{10,}$/.test(r.data.turnstileSiteKey));
  } else if (process.env.EXPECT_PUBLIC_REGISTRATION === 'false') {
    assert.equal(enabled, false, 'Release must remain disabled until credentials are verified');
  }
  console.log('PUBLIC_REGISTRATION:', enabled ? 'enabled' : 'disabled');
  const anon = await request(frontend, '/api/v1/me');
  assert.equal(anon.status, 401, JSON.stringify(anon.data));
});

test('fake Turnstile tokens cannot create accounts or request emails', { timeout: 120_000 }, async () => {
  const status = await request(frontend, '/api/v1/status');
  assert.equal(status.status, 200);
  for (const [path, payload] of [
    ['/api/auth/sign-up/email', invalidChallenge],
    ['/api/auth/request-password-reset', { email: invalidChallenge.email, captchaToken: invalidChallenge.captchaToken }],
    ['/api/auth/send-verification-email', { email: invalidChallenge.email, captchaToken: invalidChallenge.captchaToken }],
  ]) {
    const result = await post(path, payload);
    if (status.data.publicRegistration) assert.equal(result.status, 403, path + ': ' + JSON.stringify(result.data));
    else assert.ok(result.status >= 400 && result.status < 500, path + ': ' + JSON.stringify(result.data));
    console.log('BLOCKED:', path, result.status);
  }
  const direct = await post('/api/auth/sign-up/email', invalidChallenge, backend);
  if (status.data.publicRegistration) assert.equal(direct.status, 403, JSON.stringify(direct.data));
  else assert.ok(direct.status >= 400 && direct.status < 500, JSON.stringify(direct.data));
  console.log('BLOCKED: direct Render sign-up', direct.status);
});
