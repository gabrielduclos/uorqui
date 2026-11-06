import assert from 'node:assert/strict';
import { test } from 'node:test';

// Read-only health checks and *invalid* Turnstile challenges only.
// Never send a real production registration or email from CI.
const frontend = process.env.FRONTEND_ORIGIN ?? 'https://main.uorqui1.workers.dev';
assert.ok(['https://main.uorqui1.workers.dev','https://uorqui.app'].includes(frontend),
  'Live tests may only target known Uorqui origins');
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

// Read-only regression check: an obsolete feed endpoint must not be reachable on
// either the public Worker proxy or the Render backend before schema removal.
test('retired global feed endpoints are unavailable on Cloudflare and Render', { timeout: 120_000 }, async () => {
  await ready(backend);
  for (const origin of [backend, frontend]) {
    const response=await request(origin, '/api/v1/feed/posts');
    assert.equal(response.status, 404,
      'Old feed API still responds on '+origin+': '+response.status+' '+JSON.stringify(response.data));
  }
});

// A new meeting endpoint returns 401 before any room or member lookup.
// The prior API release returned 404, making this a harmless deployment check.
test('live meeting routes are deployed and reject anonymous access', { timeout: 180_000 }, async () => {
  const path='/api/v1/communities/00000000-0000-4000-8000-000000000001/channels/00000000-0000-4000-8000-000000000002/meeting';
  for (const origin of [backend,frontend]) {
    await ready(origin);
    let result;
    for(let attempt=0;attempt<12;attempt++){
      result=await request(origin,path);
      if(result.status===401)break;
      if(result.status!==404)break;
      await new Promise(resolve=>setTimeout(resolve,8000));
    }
    assert.equal(result.status,401,'Meeting API must be deployed and require login on '+origin+': '+JSON.stringify(result.data));
  }
});

// Safe unauthenticated probes: 401 confirms the new meeting and password
// endpoints are deployed while leaving production data untouched.
test('meeting and password routes are deployed and refuse unauthenticated access', { timeout: 120_000 }, async () => {
  await ready(backend);
  const id='00000000-0000-0000-0000-000000000000';
  const base='/api/v1/communities/'+id+'/channels/'+id;
  for (const origin of [backend, frontend]) {
    const meeting=await request(origin,base+'/meeting');
    assert.equal(meeting.status,401,
      'Meeting API not ready at '+origin+': '+meeting.status+' '+JSON.stringify(meeting.data));
    // The preview Worker and the custom domain may have different allowed
    // browser origins. A 403 must be explicitly the server's origin guard,
    // never an authentication bypass or a route-not-found response.
    let originAccepted=false;
    const observations=[];
    for (const browserOrigin of [...new Set([frontend,'https://uorqui.app'])]) {
      const unlock=await request(origin,base+'/unlock',{
        method:'POST',headers:{origin:browserOrigin,'content-type':'application/json'},
        body:JSON.stringify({password:'test-only-no-actual-member'})
      });
      observations.push({browserOrigin,status:unlock.status,error:unlock.data?.error});
      if(unlock.status===401)originAccepted=true;
      else assert.equal(unlock.status===403&&unlock.data?.error==='Invalid origin',true,
        'Unexpected protected-channel response on '+origin+': '+JSON.stringify(observations));
    }
    assert.equal(originAccepted,true,'Neither known Uorqui origin is allowed to unlock a channel at '+origin+': '+JSON.stringify(observations));
  }
});

test('official Uorqui custom domain has ready API and authenticated meetings', { timeout: 120_000 }, async () => {
  const official='https://uorqui.app';
  const state=await ready(official);
  assert.equal(state.data.status,'ready');
  const channel='/api/v1/communities/00000000-0000-4000-8000-000000000001/channels/00000000-0000-4000-8000-000000000002/meeting';
  const response=await request(official,channel);
  assert.equal(response.status,401,'Official domain must reject anonymous meeting access');
});

// Anonymous checks do not read, download or modify any conversation data.
// A 401 confirms both endpoints are deployed; older API versions return 404.
test('DM gallery and pinned message endpoints are deployed and deny anonymous access', { timeout: 180_000 }, async () => {
  const fakeId='00000000-0000-0000-0000-000000000000';
  const base='/api/v1/dm/conversations/'+fakeId;
  const paths=[base+'/attachments?kind=media',base+'/pinned'];
  for (const origin of [backend,frontend]) {
    await ready(origin);
    for (const path of paths) {
      let response;
      for (let attempt=0;attempt<12;attempt++) {
        response=await request(origin,path);
        if (response.status===401 || response.status!==404)break;
        await new Promise(resolve=>setTimeout(resolve,8000));
      }
      assert.equal(response.status,401,
        'DM API route must require authentication on '+origin+path+
        ': '+response.status+' '+JSON.stringify(response.data));
    }
  }
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
  // Password recovery may return a generic 200 for unknown users while signup
  // remains closed. Check its CAPTCHA only when public-registration gate is on.
  const flows = [['/api/auth/sign-up/email', invalidChallenge]];
  if (status.data.publicRegistration) {
    flows.push(
      ['/api/auth/request-password-reset', { email: invalidChallenge.email, captchaToken: invalidChallenge.captchaToken }],
      ['/api/auth/send-verification-email', { email: invalidChallenge.email, captchaToken: invalidChallenge.captchaToken }],
    );
  }
  for (const [path, payload] of flows) {
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
