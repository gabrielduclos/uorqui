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
  const send = async(path,method='GET',body,withOrigin=true)=>{
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
  send.events = signal => fetch(base+'/api/v1/dm/events', {
    headers:{accept:'text/event-stream',...(cookie?{cookie}:{})},
    signal,
  });
  return send;
}

// Parse actual event-stream bytes rather than directly calling the event bus.
// The stream is authenticated with the same session cookie used for messages.
async function openEventStream(send) {
  const controller=new AbortController();
  const response=await send.events(controller.signal);
  assert.equal(response.status,200,'SSE session should authenticate');
  assert.match(response.headers.get('content-type')??'',/text\/event-stream/);
  const reader=response.body.getReader();
  const decoder=new TextDecoder();
  let buffer='';
  const timeout=setTimeout(()=>controller.abort(),18_000);
  async function next(type='dm-update', kind) {
    for (;;) {
      const index=buffer.indexOf('\n\n');
      if(index>=0){
        const block=buffer.slice(0,index);
        buffer=buffer.slice(index+2);
        const event=block.match(/^event: ([^\n]+)/m)?.[1];
        if(event!==type)continue;
        const payload=block.match(/^data: (.+)$/m)?.[1]??'{}';
        const value=JSON.parse(payload);
        if(kind && value.kind!==kind)continue;
        return value;
      }
      const chunk=await reader.read();
      if(chunk.done)throw new Error('SSE stream ended before expected event');
      buffer+=decoder.decode(chunk.value,{stream:true}).replace(/\r\n/g,'\n');
    }
  }
  return {next,close(){clearTimeout(timeout);controller.abort();void reader.cancel().catch(()=>{});}};
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
  const anonymousStream=await anon.events(AbortSignal.timeout(2000));
  assert.equal(anonymousStream.status,401,'anonymous streaming must be denied');

  const search=await alice('/api/v1/dm/people?q=dm_bob');
  assert.equal(search.status,200,JSON.stringify(search.data));
  assert.ok(search.data.people.some(p=>p.handle==='dm_bob'));
  assert.equal(search.data.people[0].email,undefined);

  const badOrigin=await alice('/api/v1/dm/conversations','POST',{handle:'dm_bob'},false);
  assert.equal(badOrigin.status,403);

  const self=await alice('/api/v1/dm/conversations','POST',{handle:'dm_alice'});
  assert.equal(self.status,404);

  const aliceStream=await openEventStream(alice);
  const bobStream=await openEventStream(bob);
  const otherStream=await openEventStream(other);
  try {
    await Promise.all([aliceStream.next('ready'),bobStream.next('ready'),otherStream.next('ready')]);

  const opened=await alice('/api/v1/dm/conversations','POST',{handle:'dm_bob'});
  assert.equal(opened.status,200,JSON.stringify(opened.data));
  const id=opened.data.id;
  assert.match(id,/^[0-9a-f-]{36}$/);
  const [aliceOpen,bobOpen]=await Promise.all([
    aliceStream.next('dm-update','conversation'),bobStream.next('dm-update','conversation'),
  ]);
  assert.equal(aliceOpen.conversationId,id);
  assert.equal(bobOpen.conversationId,id);
  assert.equal(aliceOpen.body,undefined,'SSE must not expose message bodies');

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
  const [aliceMessage,bobMessage]=await Promise.all([
    aliceStream.next('dm-update','message'),bobStream.next('dm-update','message'),
  ]);
  assert.equal(aliceMessage.conversationId,id);
  assert.equal(bobMessage.conversationId,id);

  const repeat=await alice('/api/v1/dm/conversations/'+id+'/messages','POST',{
    body:'Olá, mensagem persistida!',clientId:firstId,
  });
  assert.equal(repeat.status,200);
  assert.equal(repeat.data.message.id,message.data.message.id);

  const received=await bob('/api/v1/dm/conversations/'+id+'/messages');
  assert.equal(received.status,200);
  assert.equal(received.data.messages.length,1);
  assert.equal(received.data.messages[0].body,'Olá, mensagem persistida!');

  // Regression contract: fetching history (or listing an open row) never
  // acknowledges a message. Only the explicit /read action may do so.
  const afterHistoryOnly=await bob('/api/v1/dm/conversations');
  assert.equal(afterHistoryOnly.status,200);
  assert.equal(afterHistoryOnly.data.conversations[0].unreadCount,1);
  assert.equal(received.data.messages[0].readAt,null);

  const listed=await bob('/api/v1/dm/conversations');
  assert.equal(listed.status,200);
  assert.equal(listed.data.conversations[0].peerHandle,'dm_alice');
  assert.equal(listed.data.conversations[0].unreadCount,1);
  assert.equal(listed.data.conversations[0].lastBody,'Olá, mensagem persistida!');

  const read=await bob('/api/v1/dm/conversations/'+id+'/read','POST');
  assert.equal(read.status,200);
  assert.equal(read.data.read,1);
  const [aliceRead,bobRead]=await Promise.all([
    aliceStream.next('dm-update','read'),bobStream.next('dm-update','read'),
  ]);
  assert.equal(aliceRead.conversationId,id);
  assert.equal(bobRead.conversationId,id);
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
  } finally {
    aliceStream.close();bobStream.close();otherStream.close();
  }
});

test('live DM actions: delivery, edit, react, forward, delete and ownership',async()=>{
  const list=await alice('/api/v1/dm/conversations');
  const thread=list.data.conversations.find(c=>c.peerHandle==='dm_bob');
  assert.ok(thread);
  const path='/api/v1/dm/conversations/'+thread.id;
  const originals=await bob(path+'/messages');
  const reply=originals.data.messages.find(m=>m.body==='Recebido!');
  assert.ok(reply);
  const item=path+'/messages/'+reply.id;

  const delivered=await alice(path+'/received','POST');
  assert.equal(delivered.status,200);
  const afterDelivered=await alice(path+'/messages');
  const got=afterDelivered.data.messages.find(m=>m.id===reply.id);
  assert.ok(got.deliveredAt);
  assert.equal(got.readAt,null,'delivery does not imply read');

  const forged=await other(item,'PATCH',{body:'unauthorized'});
  assert.equal(forged.status,404);
  const badOrigin=await bob(item,'PATCH',{body:'invalid origin'},false);
  assert.equal(badOrigin.status,403);
  const edited=await bob(item,'PATCH',{body:'Recebido, editado!'});
  assert.equal(edited.status,200,JSON.stringify(edited.data));
  assert.equal(edited.data.message.body,'Recebido, editado!');
  assert.ok(edited.data.message.editedAt);
  const seen=await alice(path+'/messages');
  assert.equal(seen.data.messages.find(m=>m.id===reply.id).body,'Recebido, editado!');

  const selfReaction=await bob(item+'/reaction','PUT',{emoji:'👍'});
  assert.equal(selfReaction.status,404,'author cannot react to their own message');
  const react=await alice(item+'/reaction','PUT',{emoji:'❤️'});
  assert.equal(react.status,200);
  const reacted=await alice(path+'/messages');
  const reactedMessage=reacted.data.messages.find(m=>m.id===reply.id);
  assert.equal(reactedMessage.myReaction,'❤️');
  assert.deepEqual(reactedMessage.reactions,[{emoji:'❤️',count:1}]);
  const undo=await alice(item+'/reaction','DELETE');
  assert.equal(undo.status,200);
  const unreacted=await alice(path+'/messages');
  assert.equal(unreacted.data.messages.find(m=>m.id===reply.id).myReaction,null);

  const target=await bob('/api/v1/dm/conversations','POST',{handle:'dm_other'});
  assert.equal(target.status,200);
  const clientId=crypto.randomUUID();
  const forward=await bob(item+'/forward','POST',{targetConversationId:target.data.id,clientId});
  assert.equal(forward.status,201,JSON.stringify(forward.data));
  assert.equal(forward.data.message.forwarded,true);
  const forwardAgain=await bob(item+'/forward','POST',{targetConversationId:target.data.id,clientId});
  assert.equal(forwardAgain.status,200);
  assert.equal(forwardAgain.data.message.id,forward.data.message.id);
  const destination=await other('/api/v1/dm/conversations/'+target.data.id+'/messages');
  assert.equal(destination.data.messages.at(-1).body,'Recebido, editado!');
  assert.equal(destination.data.messages.at(-1).forwarded,true);
  const sameConversation=await bob(item+'/forward','POST',{targetConversationId:thread.id,clientId:crypto.randomUUID()});
  assert.equal(sameConversation.status,400);

  const deleted=await bob(item,'DELETE');
  assert.equal(deleted.status,200);
  assert.equal(deleted.data.deleted,true);
  const tombstone=await alice(path+'/messages');
  const erased=tombstone.data.messages.find(m=>m.id===reply.id);
  assert.ok(erased.deletedAt);
  assert.equal(erased.body,'','deleted text must not leak to conversation history');
  const editAfterDelete=await bob(item,'PATCH',{body:'Should not restore'});
  assert.equal(editAfterDelete.status,404);
  const reactAfterDelete=await alice(item+'/reaction','PUT',{emoji:'👍'});
  assert.equal(reactAfterDelete.status,404);
});

test('real DM replies: referenced originals, conversation isolation, idempotency and deleted previews',async()=>{
  const bobList=await bob('/api/v1/dm/conversations');
  const aliceThread=bobList.data.conversations.find(thread=>thread.peerHandle==='dm_alice');
  const otherThread=bobList.data.conversations.find(thread=>thread.peerHandle==='dm_other');
  assert.ok(aliceThread && otherThread);
  const path='/api/v1/dm/conversations/'+aliceThread.id;
  const originals=await alice(path+'/messages');
  const source=originals.data.messages.find(message=>message.body==='Olá, mensagem persistida!');
  assert.ok(source);

  const wrongConversation=await bob('/api/v1/dm/conversations/'+otherThread.id+'/messages','POST',{
    body:'Wrong conversation',clientId:crypto.randomUUID(),replyToId:source.id,
  });
  assert.equal(wrongConversation.status,404,'a reply cannot reference another conversation');

  const messageId=crypto.randomUUID();
  const send=await bob(path+'/messages','POST',{
    body:'Esta é uma resposta real.',clientId:messageId,replyToId:source.id,
  });
  assert.equal(send.status,201,JSON.stringify(send.data));
  assert.equal(send.data.message.replyToId,source.id);
  const repeat=await bob(path+'/messages','POST',{
    body:'Esta é uma resposta real.',clientId:messageId,replyToId:source.id,
  });
  assert.equal(repeat.status,200);
  assert.equal(repeat.data.message.id,send.data.message.id);

  const history=await alice(path+'/messages');
  const reply=history.data.messages.find(message=>message.id===send.data.message.id);
  assert.equal(reply.body,'Esta é uma resposta real.');
  assert.equal(reply.replyToId,source.id);
  assert.deepEqual(reply.replyTo,{
    id:source.id,body:source.body,authorId:source.authorId,deleted:false,
  });

  const removed=await alice(path+'/messages/'+source.id,'DELETE');
  assert.equal(removed.status,200);
  const afterDeletion=await bob(path+'/messages');
  const replyAfter=afterDeletion.data.messages.find(message=>message.id===reply.id);
  assert.equal(replyAfter.replyTo.id,source.id);
  assert.equal(replyAfter.replyTo.deleted,true);
  assert.equal(replyAfter.replyTo.body,'','deleted source text must not leak');

  const replyToDeleted=await bob(path+'/messages','POST',{
    body:'Invalid reply',clientId:crypto.randomUUID(),replyToId:source.id,
  });
  assert.equal(replyToDeleted.status,404);
});
