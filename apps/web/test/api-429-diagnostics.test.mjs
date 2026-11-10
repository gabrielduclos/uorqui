import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  summarize429, getRateLimitDiagnostics, clearRateLimitDiagnostics,
  installRateLimitDiagnostics,
} from '../src/api429Diagnostics.ts';

test('429 forwarded by Render is distinguished from edge-originated 429',()=>{
  const response=new Response('{}',{status:429,headers:{
    'x-uorqui-upstream-429':'1',
    'x-uorqui-rate-limit-scope':'better-auth',
    'retry-after':'30',
  }});
  const event=summarize429(response,new URL('https://uorqui.app/api/auth/get-session?token=secret'),
    new Date('2026-11-10T15:00:00Z'));
  assert.deepEqual(event,{
    time:'2026-11-10T15:00:00.000Z',
    route:'/api/auth/get-session',
    origin:'render-upstream',
    scope:'better-auth',
    retryAfterSeconds:30,
  });
  const edge=summarize429(new Response('{}',{status:429}),
    new URL('https://uorqui.app/api/v1/mail/accounts/abc123longprivatevalue/messages/secret'));
  assert.equal(edge.origin,'edge-or-unknown');
  assert.equal(edge.scope,'unclassified');
  assert.equal(edge.retryAfterSeconds,null);
  assert.doesNotMatch(JSON.stringify(edge),/abc123longprivatevalue|secret|token/);
});

test('interceptor records only same-origin API 429 without request data',async()=>{
  const oldFetch=globalThis.fetch;
  const oldWindow=globalThis.window;
  const requests=[];
  globalThis.window={location:{
    href:'https://uorqui.app/',
    origin:'https://uorqui.app',
  }};
  globalThis.fetch=async(input)=>{
    const uri=typeof input==='string'?input:input.toString();
    requests.push(uri);
    return new Response('{}',{status:uri.includes('success')?200:429,headers:{
      'x-uorqui-upstream-429':uri.includes('upstream')?'1':'0',
      'x-uorqui-rate-limit-scope':uri.includes('upstream')?'application':'unclassified',
    }});
  };
  try{
    clearRateLimitDiagnostics();
    installRateLimitDiagnostics();
    await fetch('/api/v1/communities/12345678-1234-1234-1234-123456789abc/upstream',{method:'POST',body:'private'});
    await fetch('/api/v1/success');
    await fetch('https://external.example/api/other');
    const result=window.__uorquiRateLimitDiagnostics();
    assert.equal(result.count,1);
    assert.equal(result.recent.length,1);
    assert.equal(result.recent[0].origin,'render-upstream');
    assert.equal(result.recent[0].scope,'application');
    assert.doesNotMatch(JSON.stringify(result),/private|12345678-1234-1234-1234-123456789abc/);
  }finally{
    globalThis.fetch=oldFetch;
    globalThis.window=oldWindow;
    clearRateLimitDiagnostics();
  }
});

test('Fastify app reports 429 produced by its own domain rules',()=>{
  const server=readFileSync(new URL('../../api/src/server.ts',import.meta.url),'utf8');
  assert.match(server,/app\.addHook\('onSend',[\s\S]*?reply\.statusCode !== 429/);
  assert.match(server,/x-uorqui-rate-limit-scope',[\s\S]*?'application'/);
});
