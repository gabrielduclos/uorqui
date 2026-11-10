import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rateLimitRetryDelay } from '../src/rateLimitBackoff.ts';

test('unavailable or malformed Retry-After uses a conservative 30 second fallback',()=>{
  for (const value of [null,'','not-a-date','-1']) {
    assert.equal(rateLimitRetryDelay(value),30000);
  }
});
test('Retry-After seconds are bounded and do not cause rapid retries',()=>{
  assert.equal(rateLimitRetryDelay('1'),30000);
  assert.equal(rateLimitRetryDelay('60'),60000);
  assert.equal(rateLimitRetryDelay('600'),180000);
});
test('Retry-After HTTP-date is respected with a fixed clock',()=>{
  const now=Date.parse('2026-11-10T12:00:00.000Z');
  assert.equal(rateLimitRetryDelay('Tue, 10 Nov 2026 12:01:00 GMT',now),60000);
  assert.equal(rateLimitRetryDelay('Tue, 10 Nov 2026 11:59:00 GMT',now),30000);
});
