import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { MessageChannel } from 'node:worker_threads';

const worker=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const shell=readFileSync(new URL('../src/SocialShell.tsx',import.meta.url),'utf8');
const origin='https://social.example';

async function click({pages=[],path='/?conversation=thread',openWindow=async()=>{}}={}){
  const listeners=new Map();
  let closed=false;
  runInNewContext(worker,{
    URL,MessageChannel,clearTimeout,
    // Exercise the timeout fallback without making each test wait three seconds.
    setTimeout:callback=>setTimeout(callback,250),
    self:{location:{origin},addEventListener:(type,handler)=>listeners.set(type,handler),
      clients:{matchAll:async()=>pages,openWindow}},
  });
  let pending;
  listeners.get('notificationclick')({
    notification:{data:{url:path},close:()=>{closed=true;}},
    waitUntil:promise=>{pending=promise;},
  });
  await pending;
  assert.equal(closed,true);
}

for(const visibilityState of ['visible','hidden']){
  for(const path of ['/?conversation=thread','/?community=group&channel=room',
    '/?notification=activity','/?communityInvite=group','/?mailAccount=account&mailMessage=message']){
    test(`${visibilityState} app opens ${path} internally without reloading`,async()=>{
      const calls=[];
      await click({path,pages:[{
        visibilityState,
        focus:async()=>{calls.push('focus');},
        postMessage:(data,ports)=>{
          calls.push({...data});
          ports[0].postMessage({type:'uorqui:push-opened'});
        },
        navigate:async()=>assert.fail('must not reload a responding app'),
      }],openWindow:async()=>assert.fail('must reuse the open app')});
      assert.deepEqual(calls,['focus',{type:'uorqui:push-open',url:origin+path}]);
    });
  }
}

test('suspended or older app falls back to durable URL navigation',async()=>{
  const calls=[];
  await click({pages:[{visibilityState:'hidden',focus:async()=>{},postMessage:()=>{},
    navigate:async url=>{calls.push(url);return {focus:async()=>calls.push('focused')};}}]});
  assert.deepEqual(calls,[origin+'/?conversation=thread','focused']);
});

test('stale client falls back to opening a new window',async()=>{
  const calls=[];
  await click({pages:[{focus:async()=>{throw Error('closed');},
    postMessage:()=>{throw Error('closed');},navigate:async()=>null}],
    openWindow:async url=>calls.push(url)});
  assert.deepEqual(calls,[origin+'/?conversation=thread']);
});

test('closed app cold-starts from the destination URL',async()=>{
  const calls=[];
  await click({openWindow:async url=>calls.push(url)});
  assert.deepEqual(calls,[origin+'/?conversation=thread']);
});

test('focused app is preferred over another background window',async()=>{
  let opened=false;
  await click({pages:[{postMessage:()=>assert.fail('wrong window')},
    {focused:true,focus:async()=>{},postMessage:(_data,ports)=>{
      opened=true;ports[0].postMessage({type:'uorqui:push-opened'});
    }}]});
  assert.equal(opened,true);
});

test('external destinations never navigate or open windows',async()=>{
  await click({path:'https://external.example/',
    openWindow:async()=>assert.fail('external destination')});
});

test('React confirms receipt after dispatching internal navigation',()=>{
  assert.match(shell,/openPushDestination\(data.url\);\s*event.ports\?\.\[0\]\?\.postMessage\(\{type:'uorqui:push-opened'\}\)/);
});
