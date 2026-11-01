import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {allowedWebOrigins} from '../dist/auth/web-origins.js';

const previous = {
  NODE_ENV: process.env.NODE_ENV,
  WEB_ORIGIN: process.env.WEB_ORIGIN,
  WEB_EXTRA_ORIGINS: process.env.WEB_EXTRA_ORIGINS,
};
after(() => {
  for (const [key,value] of Object.entries(previous)) {
    if (value===undefined) delete process.env[key];
    else process.env[key]=value;
  }
});

test('domain cutover permits only canonical and explicitly listed browser origins', () => {
  process.env.NODE_ENV='production';
  process.env.WEB_ORIGIN='https://main.uorqui1.workers.dev';
  process.env.WEB_EXTRA_ORIGINS='https://uorqui.app,https://main.uorqui1.workers.dev';
  assert.deepEqual(allowedWebOrigins(),[
    'https://main.uorqui1.workers.dev','https://uorqui.app',
  ]);
  process.env.WEB_ORIGIN='https://uorqui.app';
  assert.deepEqual(allowedWebOrigins(),[
    'https://uorqui.app','https://main.uorqui1.workers.dev',
  ]);
});

test('domain migration must reject wildcard, unencrypted and path origins', () => {
  process.env.NODE_ENV='production';
  process.env.WEB_ORIGIN='https://uorqui.app';
  for (const invalid of ['http://main.uorqui1.workers.dev','https://evil.example/path',
    'https://*.example.com','https://other.example/?next=/', 'https://user:pass@evil.example']) {
    process.env.WEB_EXTRA_ORIGINS=invalid;
    assert.throws(()=>allowedWebOrigins(), 'Expected to reject '+invalid);
  }
});
