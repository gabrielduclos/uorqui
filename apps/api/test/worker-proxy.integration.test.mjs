import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
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
          ...(options.rawBody ? { 'content-type': options.contentType } : options.body ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
        ...(options.rawBody ? { body: options.rawBody } : options.body ? { body: JSON.stringify(options.body) } : {}),
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

    // Verification links sent before the fix used callbackURL=/ and hid the result.
    // Verify that both old and new links redirect to the dedicated result screen,
    // without exposing the verification token in the callback URL.
    const failed = await request('/api/auth/verify-email?token=not-a-jwt&callbackURL=' +
      encodeURIComponent(browserOrigin), { method: 'GET' });
    assert.ok([302, 303, 307].includes(failed.response.status),
      'invalid verification token must redirect to the result page');
    const failedLocation = new URL(failed.response.headers.get('location'));
    assert.equal(failedLocation.origin + failedLocation.pathname,
      browserOrigin + '/auth/email-verification');
    assert.ok(failedLocation.searchParams.has('error'), 'invalid token must show an error');
    assert.equal(failedLocation.searchParams.has('token'), false, 'never expose token in result URL');

    // Generate a local-only signed test token; no real confirmation email or
    // production account is used by the integration environment.
    const issuedAt = Math.floor(Date.now() / 1000);
    const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = enc({ alg: 'HS256', typ: 'JWT' }) + '.' +
      enc({ email: 'worker-proxy-ci@example.invalid', iat: issuedAt, exp: issuedAt + 3600 });
    const signature = createHmac('sha256', process.env.AUTH_SECRET).update(unsigned).digest('base64url');
    const verification = unsigned + '.' + signature;
    const verified = await request('/api/auth/verify-email?token=' +
      encodeURIComponent(verification) + '&callbackURL=' + encodeURIComponent(browserOrigin),
      { method: 'GET' });
    assert.ok([302, 303, 307].includes(verified.response.status),
      'verified email must redirect, not silently load the home page');
    const verifiedLocation = new URL(verified.response.headers.get('location'));
    assert.equal(verifiedLocation.origin + verifiedLocation.pathname,
      browserOrigin + '/auth/email-verification');
    assert.equal(verifiedLocation.searchParams.get('result'), 'success');
    assert.equal(verifiedLocation.searchParams.has('error'), false);
    assert.equal(verifiedLocation.searchParams.has('token'), false);

    const session = await request('/api/auth/get-session');
    assert.equal(session.response.status, 200);
    assert.equal(session.body?.user?.emailVerified, true, 'email was actually confirmed in the database');

    const resultPage = await fetch(browserOrigin + '/auth/email-verification?result=success', {
      headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' }, redirect: 'manual',
    });
    assert.equal(resultPage.status, 200, 'verification result must render directly');
    assert.equal(resultPage.headers.get('location'), null, 'result must not redirect to home');
    assert.match(await resultPage.text(), /<div id="root">/i);

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

    // SSE must stream through the production-shaped Cloudflare Worker proxy.
    const anonEvents = await fetch(browserOrigin + '/api/v1/dm/events', {
      headers: { accept: 'text/event-stream' }, redirect: 'manual',
    });
    assert.equal(anonEvents.status, 401, 'anonymous SSE access is denied');
    const sseAbort = new AbortController();
    const sseTimeout = setTimeout(() => sseAbort.abort(), 15_000);
    try {
      const stream = await fetch(browserOrigin + '/api/v1/dm/events', {
        headers: { accept: 'text/event-stream', cookie }, signal: sseAbort.signal,
      });
      assert.equal(stream.status, 200);
      assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/);
      const reader = stream.body.getReader();
      const initial = await reader.read();
      assert.ok(!initial.done && initial.value, 'SSE sends initial frames immediately');
      assert.match(new TextDecoder().decode(initial.value), /retry: 2000|event: ready/);
      await reader.cancel();
    } finally {
      clearTimeout(sseTimeout);
      sseAbort.abort();
    }

    // Deep links must render the React SPA shell, not redirect to the home route.
    // Browsers send Sec-Fetch-Mode: navigate for a link opened in a new tab or after reload.
    for (const path of ['/@worker_ci', '/%40worker_ci']) {
      const deepLink = await fetch(browserOrigin + path, {
        headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' },
        redirect: 'manual',
      });
      assert.equal(deepLink.status, 200, 'Public profile deep link must be served directly: ' + path);
      assert.equal(deepLink.headers.get('location'), null, 'Deep link must not redirect to /');
      const html = await deepLink.text();
      assert.match(html, /<div id="root">/i, 'Deep link must serve the React entry point');
    }

    // Simulates direct image upload through a local R2 binding in Wrangler.
    // A tiny valid PNG signature is sufficient for storage tests.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+VypcAAAAASUVORK5CYII=', 'base64');
    const uploaded = await request('/api/media/profile/avatar', {
      method: 'POST', rawBody: png, contentType: 'image/png',
    });
    assert.equal(uploaded.response.status, 200, JSON.stringify(uploaded.body));
    assert.match(uploaded.body.url, /^\/media\/profile\/[0-9a-f-]{36}\/avatar\/[0-9a-f-]{36}\.png$/);

    const imagePath = uploaded.body.url;
    const ownerImage = await fetch(browserOrigin + imagePath, { headers: { cookie } });
    assert.equal(ownerImage.status, 200);
    assert.equal(ownerImage.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await ownerImage.arrayBuffer()), png);

    const privacy = await request('/api/v1/me/profile', { method: 'PATCH', body: { isPublic: false } });
    assert.equal(privacy.response.status, 200);
    const anonymousImage = await fetch(browserOrigin + imagePath);
    assert.equal(anonymousImage.status, 404, 'private profile image requires the owner session');
    const privateOwnerImage = await fetch(browserOrigin + imagePath, { headers: { cookie } });
    assert.equal(privateOwnerImage.status, 200);

    const removed = await request('/api/media/profile/avatar', { method: 'DELETE' });
    assert.equal(removed.response.status, 200, JSON.stringify(removed.body));
    assert.equal(removed.body.profile.avatarUrl, null);
    const staleImage = await fetch(browserOrigin + imagePath, { headers: { cookie } });
    assert.equal(staleImage.status, 404, 'removed photo must be invalidated');

    // Community avatars use the Worker media route, not the SPA static fallback.
    const communityCreated=await request('/api/v1/communities',{
      method:'POST',body:{name:'Worker photo test',slug:'worker-photo-test',visibility:'public'}
    });
    assert.equal(communityCreated.response.status,201,JSON.stringify(communityCreated.body));
    const communityId=communityCreated.body.id;
    // Larger than the old 3 MB cap while staying within the new 10 MB cap.
    const largePng=Buffer.concat([png,Buffer.alloc(3*1024*1024)]);
    const communityImage=await request('/api/media/community/'+communityId,{
      method:'POST',rawBody:largePng,contentType:'image/png'
    });
    assert.equal(communityImage.response.status,200,JSON.stringify(communityImage.body));
    assert.match(communityImage.body.url,/^\/media\/community\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/);
    const communityPhoto=await fetch(browserOrigin+communityImage.body.url,{headers:{cookie}});
    assert.equal(communityPhoto.status,200,'community image must reach Worker and R2');
    assert.equal(communityPhoto.headers.get('content-type'),'image/png');
    assert.deepEqual(Buffer.from(await communityPhoto.arrayBuffer()),largePng);
    const anonymousCommunityPhoto=await fetch(browserOrigin+communityImage.body.url);
    assert.equal(anonymousCommunityPhoto.status,404,'community photos must respect authorization');
    const oversize=await request('/api/media/community/'+communityId,{
      method:'POST',rawBody:Buffer.concat([png,Buffer.alloc(10*1024*1024)]),contentType:'image/png'
    });
    assert.equal(oversize.response.status,413,'larger than 10 MB cannot be uploaded');

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
