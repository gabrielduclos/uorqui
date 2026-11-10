import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const auth=readFileSync(new URL('../src/AuthPanel.tsx',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');

test('authentication bootstrap serializes probes and does not send me while status is unavailable',()=>{
  assert.match(auth,/const statusResponse = await requestJson\('\/api\/v1\/status'\)/);
  assert.match(auth,/statusResponse\.response\.ok \? await requestJson\('\/health\/ready'\) : null/);
  assert.match(auth,/if \(available\) \{[\s\S]*?await refresh\(\)/);
  assert.doesNotMatch(auth,/void refresh\(\);\s*void checkApi\(\)/);
  assert.match(auth,/apiRetryFloorMs/);
});
test('edge cache includes only public status and readiness probes, never sessions',()=>{
  assert.match(worker,/current\.pathname === '\/api\/v1\/status' \|\| current\.pathname === '\/health\/ready'/);
  assert.match(worker,/publicProbe && response\.ok && !response\.headers\.has\('set-cookie'\)/);
  assert.match(worker,/storeHeaders\.set\('cache-control','public, max-age=15'\)/);
  assert.match(worker,/headers\.set\('x-uorqui-upstream-429','1'\)/);
  assert.doesNotMatch(worker,/current\.pathname === '\/api\/v1\/me'\s*\|\|/);
});
