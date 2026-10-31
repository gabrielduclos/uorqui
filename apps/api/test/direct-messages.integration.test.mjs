import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const origin = 'http://localhost:5173';
const base = 'http://127.0.0.1:3049';
let server;
before(async () => {
  server=spawn(process.execPath,['apps/api/dist/server.js'],{
    cwd:process.cwd(), stdio:'ignore',
    env:{...process.env,NODE_ENV:'test',ENABLE_DEV_SIGNUP:'true',
      AUTH_BASE_URL:base,WEB_ORIGIN:origin,PORT:'3049',HOST:'127.0.0.1'},
  });
  for(let i=0;i<90;i++){
    if(server.exitCode!==null)throw new Error('API process exited');
    try{const r=await fetch(base+'/health/ready');if(r.ok)return;}catch{}
    await delay(250);
  }
  throw new Error('API startup timeout');
});
after(async()=>{if(server && server.exitCode===null){server.kill('SIGTERM');await delay(400);if(server.exitCode===null)server.kill('SIGKILL');}});

function visitor(){
  let cookie='';
  return async(path,method='GET',body,withOrigin=true)=>{
    const response=await fetch(base+path,{
      method,redirect:'manual',
      headers:{
        ...(withOrigin?{origin}:{}),
        ...(body?{'Content-Type':'application/json'}:{}),
        ...(cookie?{cookie}:{}),
      },
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    for(const val of response.headers.getSetCookie()){
      const entry=val.split(';')[0];
      const key=entry.split('=')[0];
      cookie=[...cookie.split(';').filter(Boolean).filter(item=>item.split('=')[0]!==key),entry].join('; ');
    }
    return {status:response.status,data:await response.json().catch(()=>null)};
  };
}

const alice=visitor(),bob=visitor(),other=visitor(),anon=visitor();
async function createUser(send,name,handle){
  const email=handle+'@example.invalid';
  const sign=await send('/api/auth/sign-up/email','POST',{name,email,password:'correct-horse-battery-staple-demo'});
  assert.equal(sign.status,200,JSON.stringify(sign.data));
  const onboard=await send('/api/v1/onboarding','POST',{handle,displayName:name});
  assert.equal(onboard.status,201,JSON.stringify(onboard.data));
  const me=await send('/api/v1/me');
  return me.data.user.id;
}

test('direct chat: two users, private membership, idempotence, read receipt and visibility',async()=>{
  const aliceId=await createUser(alice,'DM Alice','dm_alice');
  const bobId=await createUser(bob,'DM Bob','dm_bob');
  await createUser(other,'DM Other','dm_other');

  const noAuth=await anon('/api/v1/dm/conversations');
  assert.equal(noAuth.status,401);

  const search=await alice('/api/v1/dm/people?q=dm_bob');
  assert.equal(search.status,200,JSON.stringify(search.data));
  assert.ok(search.data.people.some(p=>p.handle==='dm_bob'));
  assert.equal(search.data.people[0].email,undefined);

  const badOrigin=await alice('/api/v1/dm/conversations','POST',{handle:'dm_bob'},false);
  assert.equal(badOrigin.status,403);

  const self=await alice('/api/v1/dm/conversations','POST',{handle:'dm_alice'});
  assert.equal(self.status,404);

  const opened=await alice('/api/v1/dm/conversations','POST',{handle:'dm_bob'});
  assert.equal(opened.status,200,JSON.stringify(opened.data));
  const id=opened.data.id;
  assert.match(id,/^[0-9a-f-]{36}$/);

  const duplicateOpening=await bob('/api/v1/dm/conversations','POST',{handle:'dm_alice'});
  assert.equal(duplicateOpening.status,200);
  assert.equal(duplicateOpening.data.id,id);

  const unauthorized=await other('/api/v1/dm/conversations/'+id+'/messages');
  assert.equal(unauthorized.status,404);
  const unauthorizedSend=await other('/api/v1/dm/conversations/'+id+'/messages','POST',{
    body:'Uninvited',clientId:crypto.randomUUID(),
  });
  assert.equal(unauthorizedSend.status,404);

  const firstId=crypto.randomUUID();
  const message=await alice('/api/v1/dm/conversations/'+id+'/messages','POST',{
    body:'Olá, mensagem persistida!',clientId:firstId,
  });
  assert.equal(message.status,201,JSON.stringify(message.data));
  assert.equal(message.data.message.authorId,aliceId);
  assert.equal(message.data.message.readAt,null);

  const repeat=await alice('/api/v1/dm/conversations/'+id+'/messages','POST',{
    body:'Olá, mensagem persistida!',clientId:firstId,
  });
  assert.equal(repeat.status,200);
  assert.equal(repeat.data.message.id,message.data.message.id);

  const received=await bob('/api/v1/dm/conversations/'+id+'/messages');
  assert.equal(received.status,200);
  assert.equal(received.data.messages.length,1);
  assert.equal(received.data.messages[0].body,'Olá, mensagem persistida!');

  const listed=await bob('/api/v1/dm/conversations');
  assert.equal(listed.status,200);
  assert.equal(listed.data.conversations[0].peerHandle,'dm_alice');
  assert.equal(listed.data.conversations[0].unreadCount,1);
  assert.equal(listed.data.conversations[0].lastBody,'Olá, mensagem persistida!');

  const read=await bob('/api/v1/dm/conversations/'+id+'/read','POST');
  assert.equal(read.status,200);
  assert.equal(read.data.read,1);
  const afterRead=await alice('/api/v1/dm/conversations/'+id+'/messages');
  assert.ok(afterRead.data.messages[0].readAt);
  const afterList=await bob('/api/v1/dm/conversations');
  assert.equal(afterList.data.conversations[0].unreadCount,0);

  const reply=await bob('/api/v1/dm/conversations/'+id+'/messages','POST',{
    body:'Recebido!',clientId:crypto.randomUUID(),
  });
  assert.equal(reply.status,201);
  assert.equal(reply.data.message.authorId,bobId);
  const both=await alice('/api/v1/dm/conversations/'+id+'/messages');
  assert.equal(both.data.messages.length,2);

  // Hiding a public profile prevents NEW discovery but does not erase an existing DM.
  const hidden=await bob('/api/v1/me/profile','PATCH',{isPublic:false});
  assert.equal(hidden.status,200);
  const hiddenPeople=await alice('/api/v1/dm/people?q=dm_bob');
  assert.equal(hiddenPeople.status,200);
  assert.equal(hiddenPeople.data.people.length,0);
  const existing=await alice('/api/v1/dm/conversations/'+id+'/messages');
  assert.equal(existing.status,200);
  assert.equal(existing.data.messages.length,2);

  const rogueRead=await other('/api/v1/dm/conversations/'+id+'/read','POST');
  assert.equal(rogueRead.status,404);
});
