import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { AccountProbeMeter } from '../dist/auth/account-probe-metrics.js';

const secret='test-auth-secret-at-least-thirty-two-bytes-long';
const api=readFileSync(new URL('../src/server.ts',import.meta.url),'utf8');

test('minute-level aggregated account counts avoid storing real account IDs',()=>{
  const meter=new AccountProbeMeter(secret,0);
  meter.record('account-1');
  meter.record('account-2');
  meter.record('account-1');
  meter.record(null);
  const summary=meter.drain(60_000);
  assert.ok(summary);
  assert.equal(summary.periodSeconds,60);
  assert.equal(summary.requests,4);
  assert.equal(summary.accounts,2);
  assert.equal(summary.anonymous,1);
  assert.equal(summary.maximumPerAccount,2);
  assert.equal(summary.averagePerAccount,1.5);
  assert.deepEqual(summary.busiestAccounts.map(a=>a.requests),[2,1]);
  assert.doesNotMatch(JSON.stringify(summary),/account-1|account-2|@|\.com/);
  assert.equal(meter.drain(120_000),null);
});

test('separate identities never share session-probe counts',()=>{
  const meter=new AccountProbeMeter(secret,0);
  for(let i=0;i<7;i++)meter.record('a');
  for(let i=0;i<2;i++)meter.record('b');
  const result=meter.drain(60_000);
  assert.equal(result.accounts,2);
  assert.equal(result.maximumPerAccount,7);
  assert.deepEqual(result.busiestAccounts.map(a=>a.requests),[7,2]);
});

test('missing secret does not leak identifiable data into logs',()=>{
  const meter=new AccountProbeMeter(undefined,0);
  meter.record('private-account-identifier');
  const result=meter.drain(60_000);
  assert.equal(result.accounts,0);
  assert.equal(result.anonymous,1);
  assert.doesNotMatch(JSON.stringify(result),/private-account/);
});

test('only authenticated /api/v1/me reads are metered at the API boundary',()=>{
  assert.match(api,/app\.get\('\/api\/v1\/me',[\s\S]*?accountProbeMeter\.record\(session\?\.user\.id \?\? null\)/);
  assert.match(api,/const accountProbeTimer = setInterval/);
  assert.match(api,/accountProbeMeter\.drain\(\)/);
  assert.match(api,/clearInterval\(accountProbeTimer\)/);
});
