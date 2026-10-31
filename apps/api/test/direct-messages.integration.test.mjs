import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const origin = 'http://localhost:5173';
const base = 'http://127.0.0.1:3049';
const ATTACHMENT_SECRET='test-only-attachment-hmac-secret-a7e012739318ee99';
function proof(conversationId,clientId,a){
  const canonical=JSON.stringify([conversationId,clientId,a.id,a.name,a.type,a.size]);
  return createHmac('sha256',ATTACHMENT_SECRET).update(canonical).digest('hex');
}
let server;
before(async () => {
  server=spawn(process.execPath,['apps/api/dist/server.js'],{
    cwd:process.cwd(), stdio:'ignore',
    env:{...process.env,NODE_ENV:'test',ENABLE_DEV_SIGNUP:'true',
      AUTH_BASE_URL:base,WEB_ORIGIN:origin,PORT:'3049',HOST:'127.0.0.1',
      DM_ATTACHMENT_PROOF_SECRET:ATTACHMENT_SECRET},
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
  const send = async(path,method='GET',body,withOrigin=true,extraHeaders={})=>{
    const response=await fetch(base+path,{
      method,redirect:'manual',
      headers:{
        ...(withOrigin?{origin}:{}),
        ...(body?{'Content-Type':'application/json'}:{}),
        ...(cookie?{cookie}:{}),
        ...extraHeaders,
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

  const aliceIdentity=await alice('/api/v1/me');
  const bobIdentity=await bob('/api/v1/me');
  assert.equal(aliceIdentity.status,200);
  assert.equal(bobIdentity.status,200);
  const aliceBeforeReaction=await alice('/api/v1/dm/conversations');
  const previousAliceUnread=aliceBeforeReaction.data.conversations.find(c=>c.id===thread.id).unreadCount;
  const selfReaction=await bob(item+'/reaction','PUT',{emoji:'👍'});
  assert.equal(selfReaction.status,404,'author cannot react to their own message');
  const react=await alice(item+'/reaction','PUT',{emoji:'❤️'});
  assert.equal(react.status,200);
  const reacted=await alice(path+'/messages');
  const reactedMessage=reacted.data.messages.find(m=>m.id===reply.id);
  assert.equal(reactedMessage.myReaction,'❤️');
  assert.deepEqual(reactedMessage.reactions,[{emoji:'❤️',count:1}]);

  const bobInbox=await bob('/api/v1/dm/conversations');
  const reactionThread=bobInbox.data.conversations.find(c=>c.id===thread.id);
  assert.equal(reactionThread.unreadReactionCount,1,'reaction notifies the original sender');
  assert.equal(reactionThread.unreadCount,1,'reaction contributes to total unread badge');
  assert.equal(reactionThread.lastReactionEmoji,'❤️','inbox previews the latest reaction');
  assert.equal(reactionThread.lastReactionMessageId,reply.id);
  assert.equal(reactionThread.lastReactionAuthorId,aliceIdentity.data.user.id,
    'recipient inbox must identify the reactor');
  assert.ok(reactionThread.lastReactionAt);
  const aliceInbox=await alice('/api/v1/dm/conversations');
  const aliceReactionThread=aliceInbox.data.conversations.find(c=>c.id===thread.id);
  assert.equal(aliceReactionThread.unreadReactionCount,0,
    'reacting user must not receive their own notification');
  assert.equal(aliceReactionThread.unreadCount,previousAliceUnread,
    'own reaction must not increment unread messages or nav badge');
  assert.equal(aliceReactionThread.lastReactionEmoji,'❤️',
    'reactor must see their reaction in inbox preview');
  assert.equal(aliceReactionThread.lastReactionMessageId,reply.id);
  assert.equal(aliceReactionThread.lastReactionAuthorId,aliceIdentity.data.user.id,
    'reactor inbox identifies own reaction');
  assert.notEqual(aliceReactionThread.lastReactionAuthorId,bobIdentity.data.user.id);

  const historyOnly=await bob(path+'/messages');
  assert.equal(historyOnly.status,200);
  const unchangedUnread=await bob('/api/v1/dm/conversations');
  assert.equal(unchangedUnread.data.conversations.find(c=>c.id===thread.id).unreadReactionCount,1,
    'loading history or the inbox alone must not mark a reaction as read');

  const sameReaction=await alice(item+'/reaction','PUT',{emoji:'❤️'});
  assert.equal(sameReaction.status,200);
  const afterSame=await bob('/api/v1/dm/conversations');
  assert.equal(afterSame.data.conversations.find(c=>c.id===thread.id).lastReactionAt,reactionThread.lastReactionAt,
    'same emoji must not retrigger a read notification');

  const bobAcknowledge=await bob(path+'/read','POST');
  assert.equal(bobAcknowledge.status,200);
  assert.equal(bobAcknowledge.data.reactionsRead,1);
  const afterAck=await bob('/api/v1/dm/conversations');
  assert.equal(afterAck.data.conversations.find(c=>c.id===thread.id).unreadCount,0);

  const anotherReaction=await alice(item+'/reaction','PUT',{emoji:'🎉'});
  assert.equal(anotherReaction.status,200);
  const afterChanged=await bob('/api/v1/dm/conversations');
  assert.equal(afterChanged.data.conversations.find(c=>c.id===thread.id).unreadReactionCount,1,
    'changing emoji creates a fresh unread reaction');
  assert.equal(afterChanged.data.conversations.find(c=>c.id===thread.id).lastReactionEmoji,'🎉');
  const ownChange=await alice('/api/v1/dm/conversations');
  assert.equal(ownChange.data.conversations.find(c=>c.id===thread.id).lastReactionEmoji,'🎉',
    'reaction edits refresh the reactor own preview');
  assert.equal(ownChange.data.conversations.find(c=>c.id===thread.id).unreadCount,previousAliceUnread,
    'changing own reaction does not add an unread notification');

  const undo=await alice(item+'/reaction','DELETE');
  assert.equal(undo.status,200);
  const unreacted=await alice(path+'/messages');
  assert.equal(unreacted.data.messages.find(m=>m.id===reply.id).myReaction,null);
  const afterUndo=await bob('/api/v1/dm/conversations');
  assert.equal(afterUndo.data.conversations.find(c=>c.id===thread.id).unreadReactionCount,0,
    'undo clears pending reaction notification');
  assert.equal(afterUndo.data.conversations.find(c=>c.id===thread.id).lastReactionEmoji,null);
  const ownUndo=await alice('/api/v1/dm/conversations');
  assert.equal(ownUndo.data.conversations.find(c=>c.id===thread.id).lastReactionEmoji,null,
    'undo must clear own reaction preview as well');
  assert.equal(ownUndo.data.conversations.find(c=>c.id===thread.id).unreadCount,previousAliceUnread);

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
  assert.equal(deleted.data.canceled,true);
  const afterCancel=await alice(path+'/messages');
  assert.equal(afterCancel.data.messages.some(m=>m.id===reply.id),false,'canceled message leaves no placeholder');
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
  const created=await alice(path+'/messages','POST',{
    body:'Mensagem de referência ainda não lida',clientId:crypto.randomUUID(),
  });
  assert.equal(created.status,201);
  const source=created.data.message;
  const around=await bob(path+'/messages?around='+source.id);
  assert.equal(around.status,200,JSON.stringify(around.data));
  assert.ok(around.data.messages.some(message=>message.id===source.id),'anchored history must include the source');
  const forbiddenAnchor=await other(path+'/messages?around='+source.id);
  assert.equal(forbiddenAnchor.status,404,'anchored history remains participant-private');
  const invalidAnchor=await bob(path+'/messages?around='+crypto.randomUUID());
  assert.equal(invalidAnchor.status,404,'unknown anchor should be unavailable');

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
  assert.equal(removed.data.canceled,true);
  const afterDeletion=await bob(path+'/messages');
  const replyAfter=afterDeletion.data.messages.find(message=>message.id===reply.id);
  assert.equal(replyAfter.replyToId,null,'canceled source unlinks replies');
  assert.equal(replyAfter.replyTo,null,'no canceled message preview remains');
  assert.equal(afterDeletion.data.messages.some(message=>message.id===source.id),false);
  const retryAfterDeletion=await bob(path+'/messages','POST',{
    body:'Esta é uma resposta real.',clientId:messageId,replyToId:source.id,
  });
  assert.equal(retryAfterDeletion.status,200,'retry should remain idempotent after source deletion');
  assert.equal(retryAfterDeletion.data.message.id,reply.id);

  const replyToDeleted=await bob(path+'/messages','POST',{
    body:'Invalid reply',clientId:crypto.randomUUID(),replyToId:source.id,
  });
  assert.equal(replyToDeleted.status,404);

  const readProtected=await alice(path+'/messages','POST',{
    body:'Mensagem que ficará protegida depois da leitura',clientId:crypto.randomUUID(),
  });
  assert.equal(readProtected.status,201);
  const markedRead=await bob(path+'/read','POST');
  assert.equal(markedRead.status,200);
  const blocked=await alice(path+'/messages/'+readProtected.data.message.id,'DELETE');
  assert.equal(blocked.status,409,'read messages cannot be canceled');
  const afterBlocked=await bob(path+'/messages');
  assert.ok(afterBlocked.data.messages.some(message=>message.id===readProtected.data.message.id));
});


test('edited DMs restart sent/received/read without erasing the original read protection',async()=>{
  const list=await alice('/api/v1/dm/conversations');
  const thread=list.data.conversations.find(c=>c.peerHandle==='dm_bob');
  assert.ok(thread);
  const path='/api/v1/dm/conversations/'+thread.id;
  const initial=await alice(path+'/messages','POST',{
    body:'Versão inicial para confirmar',clientId:crypto.randomUUID(),
  });
  assert.equal(initial.status,201,JSON.stringify(initial.data));
  const item=path+'/messages/'+initial.data.message.id;

  const delivery=await bob(path+'/received','POST');
  assert.equal(delivery.status,200);
  const firstRead=await bob(path+'/read','POST');
  assert.equal(firstRead.status,200);
  const before=await alice(path+'/messages');
  const original=before.data.messages.find(m=>m.id===initial.data.message.id);
  assert.ok(original.readAt && original.deliveredAt);
  // Editing an older message must still restart delivery if a newer chat
  // message exists (the inbox's last-message timestamp will not change).
  const later=await alice(path+'/messages','POST',{
    body:'Mensagem mais recente que não será editada',clientId:crypto.randomUUID(),
  });
  assert.equal(later.status,201);
  await bob(path+'/read','POST');
  const beforeEditList=await bob('/api/v1/dm/conversations');
  const beforeEditThread=beforeEditList.data.conversations.find(c=>c.id===thread.id);
  assert.equal(beforeEditThread.unreadCount,0);

  const edited=await alice(item,'PATCH',{body:'Versão revisada, precisa de novo recibo'});
  assert.equal(edited.status,200,JSON.stringify(edited.data));
  assert.ok(edited.data.message.editedAt);
  assert.ok(Date.parse(edited.data.message.editedAt)>Date.parse(original.readAt));
  assert.equal(edited.data.message.readAt,original.readAt,
    'retain historical read timestamp so cancel cannot be re-enabled');
  assert.equal(edited.data.message.deliveredAt,original.deliveredAt);
  const unreadAgain=await bob('/api/v1/dm/conversations');
  const changed=unreadAgain.data.conversations.find(c=>c.id===thread.id);
  assert.equal(changed.unreadCount,1,'edited revision becomes unread again');
  assert.equal(changed.lastAt,beforeEditThread.lastAt,'edit does not alter last-message timestamp');
  assert.ok(changed.pendingReceivedAt,'even old message edits must have a fresh delivery key');
  assert.ok(Date.parse(changed.pendingReceivedAt)>=Date.parse(edited.data.message.editedAt));

  const history=await bob(path+'/messages');
  const revised=history.data.messages.find(m=>m.id===original.id);
  assert.equal(revised.body,'Versão revisada, precisa de novo recibo');
  const afterHistory=await bob('/api/v1/dm/conversations');
  assert.ok(afterHistory.data.conversations.find(c=>c.id===thread.id).unreadCount>=1,
    'history fetch must not read edited content');

  const cancel=await alice(item,'DELETE');
  assert.equal(cancel.status,409,'already-read message cannot be canceled after editing');

  const redelivered=await bob(path+'/received','POST');
  assert.equal(redelivered.status,200);
  assert.ok(redelivered.data.received>=1);
  const receivedInbox=await bob('/api/v1/dm/conversations');
  assert.equal(receivedInbox.data.conversations.find(c=>c.id===thread.id).pendingReceivedAt,null,
    'no unreceived edits remain after confirming receipt');
  const updatedReceipt=await alice(path+'/messages');
  const receivedVersion=updatedReceipt.data.messages.find(m=>m.id===original.id);
  assert.ok(Date.parse(receivedVersion.deliveredAt)>=Date.parse(receivedVersion.editedAt),
    'recipient acknowledges delivery of the edited revision');
  assert.ok(Date.parse(receivedVersion.readAt)<Date.parse(receivedVersion.editedAt),
    'old read still does not mean edited revision was read');

  const reread=await bob(path+'/read','POST');
  assert.equal(reread.status,200);
  assert.ok(reread.data.read>=1);
  const finalMessages=await alice(path+'/messages');
  const final=finalMessages.data.messages.find(m=>m.id===original.id);
  assert.ok(Date.parse(final.readAt)>=Date.parse(final.editedAt),
    'edited revision must have a new read timestamp');
  const afterAck=await bob('/api/v1/dm/conversations');
  assert.equal(afterAck.data.conversations.find(c=>c.id===thread.id).unreadCount,0);
  const stillBlocked=await alice(item,'DELETE');
  assert.equal(stillBlocked.status,409);

  const editedAgain=await alice(item,'PATCH',{body:'Nova edição exige nova leitura'});
  assert.equal(editedAgain.status,200);
  const secondChange=await bob('/api/v1/dm/conversations');
  assert.equal(secondChange.data.conversations.find(c=>c.id===thread.id).unreadCount,1);
  const finalRead=await bob(path+'/read','POST');
  assert.ok(finalRead.data.read>=1);
  const finalInbox=await bob('/api/v1/dm/conversations');
  assert.equal(finalInbox.data.conversations.find(c=>c.id===thread.id).unreadCount,0);
});


test('private DM attachment metadata is scoped to both participants and canceled with the message',async()=>{
  const me=await alice('/api/v1/dm/conversations');
  const thread=me.data.conversations.find(t=>t.peerHandle==='dm_bob');
  assert.ok(thread);
  const path='/api/v1/dm/conversations/'+thread.id;
  const permitted=await alice(path+'/attachments/allowed');
  assert.equal(permitted.status,200);
  assert.equal(permitted.data.allowed,true);
  const forbidden=await other(path+'/attachments/allowed');
  assert.equal(forbidden.status,404);
  const uploadId=crypto.randomUUID(), clientId=crypto.randomUUID();
  const unsupported=await alice(path+'/messages','POST',{
    body:'',clientId:crypto.randomUUID(),attachment:{id:crypto.randomUUID(),name:'bad.html',type:'text/html',size:50},
  });
  assert.equal(unsupported.status,403,'invalid direct upload proof must fail before any attachment mutation');
  const empty=await alice(path+'/messages','POST',{body:'',clientId:crypto.randomUUID()});
  assert.equal(empty.status,400);
  const validAttachment={id:uploadId,name:'imagem de exemplo.png',type:'image/png',size:1024};
  const fake=await alice(path+'/messages','POST',{body:'',clientId,attachment:validAttachment});
  assert.equal(fake.status,403,'direct API callers cannot forge R2 uploaded objects');
  const sent=await alice(path+'/messages','POST',{
    body:'',clientId,attachment:validAttachment,
  },true,{'x-uorqui-attachment-proof':proof(thread.id,clientId,validAttachment)});
  assert.equal(sent.status,201,JSON.stringify(sent.data));
  assert.deepEqual(sent.data.message.attachment,{id:uploadId,name:'imagem de exemplo.png',type:'image/png',size:1024});
  const inbox=await bob('/api/v1/dm/conversations');
  const card=inbox.data.conversations.find(x=>x.id===thread.id);
  assert.equal(card.lastAttachmentType,'image/png',
    'inbox must expose MIME for a generic localized photo label');
  assert.equal(card.lastBody,null,'private filename must not become visible conversation preview');
  const bobMessages=await bob(path+'/messages');
  assert.deepEqual(bobMessages.data.messages.find(m=>m.id===sent.data.message.id).attachment,sent.data.message.attachment);
  const access=await bob(path+'/attachments/'+uploadId+'/access');
  assert.equal(access.status,200);
  assert.equal(access.data.allowed,true);
  assert.equal(access.data.name,'imagem de exemplo.png');
  const privateAccess=await other(path+'/attachments/'+uploadId+'/access');
  assert.equal(privateAccess.status,404);
  const unknown=await alice(path+'/attachments/'+crypto.randomUUID()+'/access');
  assert.equal(unknown.status,404);
  const retryAttachment={id:crypto.randomUUID(),name:'different.png',type:'image/png',size:42};
  const retried=await alice(path+'/messages','POST',{
    body:'',clientId,attachment:retryAttachment,
  },true,{'x-uorqui-attachment-proof':proof(thread.id,clientId,retryAttachment)});
  assert.equal(retried.status,200);
  assert.equal(retried.data.message.attachment.id,uploadId,'idempotency must preserve original attachment');
  const canceled=await alice(path+'/messages/'+sent.data.message.id,'DELETE');
  assert.equal(canceled.status,200);
  assert.equal(canceled.data.attachmentId,uploadId,'worker can reclaim R2 object after cancel');
  const afterCancel=await bob(path+'/attachments/'+uploadId+'/access');
  assert.equal(afterCancel.status,404,'canceled attachment must be inaccessible');
});

test('restored demo attachments allow signed 50 MB audio and captions, reject larger files',async()=>{
  const list=await alice('/api/v1/dm/conversations');
  const thread=list.data.conversations.find(x=>x.peerHandle==='dm_bob');
  assert.ok(thread);
  const path='/api/v1/dm/conversations/'+thread.id;
  const maxAttachment={id:crypto.randomUUID(),name:'gravacao.webm',type:'audio/webm',size:50*1024*1024};
  const clientId=crypto.randomUUID();
  const created=await alice(path+'/messages','POST',{
    body:'Legenda do áudio',clientId,attachment:maxAttachment,
  },true,{'x-uorqui-attachment-proof':proof(thread.id,clientId,maxAttachment)});
  assert.equal(created.status,201,JSON.stringify(created.data));
  assert.equal(created.data.message.body,'Legenda do áudio');
  assert.deepEqual(created.data.message.attachment,maxAttachment);
  const seen=await bob(path+'/messages');
  assert.equal(seen.data.messages.find(x=>x.id===created.data.message.id).attachment.type,'audio/webm');
  const large={id:crypto.randomUUID(),name:'maior.mp4',type:'video/mp4',size:50*1024*1024+1};
  const largeClient=crypto.randomUUID();
  const rejected=await alice(path+'/messages','POST',{
    body:'',clientId:largeClient,attachment:large,
  },true,{'x-uorqui-attachment-proof':proof(thread.id,largeClient,large)});
  assert.equal(rejected.status,400,'50MB+1 byte must be rejected by server validation');
});


test('saved contacts: personal, idempotent, no reciprocal save or DM deletion', async () => {
  // Reuse the authenticated accounts created by the first test.
  // Better Auth limits repeated signup attempts in one integration suite.
  const one = alice, two = bob, stranger = other;

  assert.equal((await anon('/api/v1/contacts')).status, 401);
  assert.equal((await one('/api/v1/contacts','POST',{handle:'dm_bob'},false)).status,403);
  assert.equal((await one('/api/v1/contacts','POST',{handle:'dm_alice'})).status,404);
  assert.equal((await one('/api/v1/contacts','POST',{handle:'nonexistent_contact'})).status,404);
  assert.equal((await one('/api/v1/contacts','POST',{handle:'dm_bob'})).status,200);
  assert.equal((await one('/api/v1/contacts','POST',{handle:'dm_bob'})).status,200);
  const saved = await one('/api/v1/contacts');
  assert.equal(saved.status,200);
  assert.equal(saved.data.contacts.length,1);
  assert.equal(saved.data.contacts[0].handle,'dm_bob');
  assert.equal(saved.data.contacts[0].displayName,'DM Bob');
  assert.equal(saved.data.contacts[0].email,undefined);
  assert.equal((await two('/api/v1/contacts')).data.contacts.length,0,'saving is not reciprocal');
  assert.equal((await stranger('/api/v1/contacts')).data.contacts.length,0,'another user cannot read my contacts');

  const chat=await one('/api/v1/dm/conversations','POST',{handle:'dm_bob'});
  assert.equal(chat.status,200);
  assert.equal((await one('/api/v1/contacts/dm_bob','DELETE',undefined,false)).status,403);
  assert.equal((await one('/api/v1/contacts/dm_bob','DELETE')).status,204);
  assert.equal((await one('/api/v1/contacts/dm_bob','DELETE')).status,204,'deletion is idempotent');
  assert.equal((await one('/api/v1/contacts')).data.contacts.length,0);
  const threads=await one('/api/v1/dm/conversations');
  assert.equal(threads.status,200);
  assert.ok(threads.data.conversations.some(c=>c.id===chat.data.id),'removing a contact preserves DM history');
});
