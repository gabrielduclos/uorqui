import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  getAccountProbe, getAccountProbeDiagnostics, invalidateAccountProbe,
} from '../src/accountProbe.ts';

const appSource=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const authSource=readFileSync(new URL('../src/AuthPanel.tsx',import.meta.url),'utf8');
const originalFetch=globalThis.fetch;
const originalDateNow=Date.now;

test('StrictMode and login panel share one in-flight account lookup',async()=>{
  invalidateAccountProbe();
  let calls=0;
  let deliver;
  globalThis.fetch=async(path,options)=>{
    assert.equal(path,'/api/v1/me');
    assert.equal(options.credentials,'same-origin');
    calls++;
    return new Promise(resolve=>{deliver=resolve;});
  };
  try{
    const before=getAccountProbeDiagnostics();
    const first=getAccountProbe();
    const second=getAccountProbe();
    await Promise.resolve();
    assert.equal(calls,1);
    deliver(new Response(JSON.stringify({user:{id:'alice'},profile:null}),{status:200}));
    const [a,b]=await Promise.all([first,second]);
    assert.equal((await a.json()).user.id,'alice');
    assert.equal((await b.json()).user.id,'alice');
    assert.equal(getAccountProbeDiagnostics().coalescedTotal-before.coalescedTotal,1);
    assert.equal(getAccountProbeDiagnostics().networkTotal-before.networkTotal,1);
  }finally{globalThis.fetch=originalFetch;invalidateAccountProbe();}
});

test('successful bootstrap is reused briefly, login forces fresh identity',async()=>{
  invalidateAccountProbe();
  let calls=0;
  globalThis.fetch=async()=>{
    calls++;
    return new Response(JSON.stringify({user:{id:calls===1?'old':'new'}}),{status:200});
  };
  try{
    const old=await getAccountProbe();
    const reused=await getAccountProbe();
    assert.equal((await old.json()).user.id,'old');
    assert.equal((await reused.json()).user.id,'old');
    assert.equal(calls,1);
    const fresh=await getAccountProbe({fresh:true});
    assert.equal((await fresh.json()).user.id,'new');
    assert.equal(calls,2);
  }finally{globalThis.fetch=originalFetch;invalidateAccountProbe();}
});

test('401 cache is short, invalidated on login and never persisted',async()=>{
  invalidateAccountProbe();
  let calls=0;
  globalThis.fetch=async()=>{
    calls++;
    return new Response(calls===1?'{}':JSON.stringify({user:{id:'new'}}),
      {status:calls===1?401:200});
  };
  try{
    assert.equal((await getAccountProbe()).status,401);
    assert.equal((await getAccountProbe()).status,401);
    assert.equal(calls,1);
    assert.equal((await getAccountProbe({fresh:true})).status,200);
    assert.equal(calls,2);
  }finally{globalThis.fetch=originalFetch;invalidateAccountProbe();}
});

test('429, 503 and transport errors are not cached',async()=>{
  invalidateAccountProbe();
  let calls=0;
  globalThis.fetch=async()=>{
    calls++;
    if(calls===1)return new Response('',{status:429});
    if(calls===2)return new Response('',{status:503});
    if(calls===3)throw new Error('network down');
    return new Response('{}',{status:200});
  };
  try{
    const before=getAccountProbeDiagnostics();
    assert.equal((await getAccountProbe()).status,429);
    assert.equal((await getAccountProbe()).status,503);
    await assert.rejects(()=>getAccountProbe(),/network down/);
    assert.equal((await getAccountProbe()).status,200);
    assert.equal(calls,4);
    assert.equal(getAccountProbeDiagnostics().rateLimitedTotal-before.rateLimitedTotal,1);
  }finally{globalThis.fetch=originalFetch;invalidateAccountProbe();}
});

test('a cancelled caller does not cancel the shared network probe',async()=>{
  invalidateAccountProbe();
  let deliver;
  globalThis.fetch=()=>new Promise(resolve=>{deliver=resolve;});
  const controller=new AbortController();
  try{
    const cancelled=getAccountProbe({signal:controller.signal});
    const healthy=getAccountProbe();
    controller.abort();
    await assert.rejects(cancelled,{name:'AbortError'});
    deliver(new Response('{}',{status:200}));
    assert.equal((await healthy).status,200);
  }finally{globalThis.fetch=originalFetch;invalidateAccountProbe();}
});

test('auth flow uses shared probes and revalidates on state transitions',()=>{
  assert.match(appSource,/getAccountProbe\(\{ signal: controller\.signal \}\)/);
  assert.match(authSource,/getAccountProbe\(\{ fresh \}\)/);
  assert.match(authSource,/await refresh\(true\)/);
  assert.match(appSource,/invalidateAccountProbe\(\)/);
  assert.match(authSource,/invalidateAccountProbe\(\)/);
});
