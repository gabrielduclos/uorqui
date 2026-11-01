import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {spawn} from 'node:child_process';
import {after,before,test} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

const base='http://127.0.0.1:3051',origin='http://localhost:5173';
let server;
before(async()=>{
  server=spawn(process.execPath,['apps/api/dist/server.js'],{
    cwd:process.cwd(),stdio:'ignore',
    env:{...process.env,NODE_ENV:'test',ENABLE_DEV_SIGNUP:'true',AUTH_BASE_URL:base,WEB_ORIGIN:origin,PORT:'3051',HOST:'127.0.0.1'},
  });
  for(let i=0;i<90;i++){
    if(server.exitCode!==null)throw Error('API exited');
    try{if((await fetch(base+'/health/ready')).ok)return;}catch{}
    await delay(250);
  }
  throw Error('API startup timed out');
});
after(async()=>{if(server&&server.exitCode===null){server.kill('SIGTERM');await delay(300);if(server.exitCode===null)server.kill('SIGKILL');}});

function visitor(){
  let cookie='';
  const send=async(path,method='GET',payload,withOrigin=true,extraHeaders={})=>{
    const response=await fetch(base+path,{
      method,headers:{...(withOrigin?{origin}:{}),...(payload?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{}),...extraHeaders},
      ...(payload?{body:JSON.stringify(payload)}:{})
    });
    for(const val of response.headers.getSetCookie()){
      const entry=val.split(';')[0],key=entry.split('=')[0];
      cookie=[...cookie.split(';').filter(Boolean).filter(x=>x.split('=')[0]!==key),entry].join('; ');
    }
    return {status:response.status,data:await response.json().catch(()=>null)};
  };
  send.cookie=()=>cookie;
  return send;
}
const owner=visitor(),member=visitor(),outsider=visitor(),anonymous=visitor();
async function signUp(user,handle){
  const r=await user('/api/auth/sign-up/email','POST',{
    name:handle,email:handle+'@example.invalid',password:'correct-horse-battery-staple-demo'
  ,termsAccepted:true,privacyNoticeAcknowledged:true,termsVersion:'2026-11-01',privacyVersion:'2026-11-01'});
  assert.equal(r.status,200,JSON.stringify(r.data));
  const onboard=await user('/api/v1/onboarding','POST',{handle,displayName:handle});
  assert.equal(onboard.status,201,JSON.stringify(onboard.data));
}

test('persistent communities: discover, create, join, channels and real messages',async()=>{
  await signUp(owner,'comm_owner');
  await signUp(member,'comm_member');
  await signUp(outsider,'comm_outsider');
  assert.equal((await anonymous('/api/v1/communities')).status,401);
  assert.equal((await member('/api/v1/communities','POST',{name:'Test Area',slug:'test-community-public',visibility:'public'},false)).status,403);
  const created=await owner('/api/v1/communities','POST',{name:'Live Community',slug:'live-community-mvp',description:'Community test',visibility:'public'});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const id=created.data.id;
  assert.equal((await owner('/api/v1/communities','POST',{name:'Same slug',slug:'live-community-mvp',visibility:'public'})).status,409);
  const discovered=await member('/api/v1/communities');
  assert.ok(discovered.data.communities.some(c=>c.id===id),'public communities are discoverable');
  const preview=await member('/api/v1/communities/'+id);
  assert.equal(preview.status,200);
  assert.equal(preview.data.community.myRole,null);
  assert.equal(preview.data.channels.length,0,'channel list is members-only');
  assert.equal((await member('/api/v1/communities/'+id+'/channels','POST',{name:'not allowed',kind:'text'})).status,403);
  assert.equal((await member('/api/v1/communities/'+id+'/join','POST')).status,200);
  const joined=await member('/api/v1/communities/'+id);
  assert.equal(joined.data.community.myRole,'member');
  assert.equal(joined.data.channels.length,2,'create includes text + voice channels');
  const text=joined.data.channels.find(c=>c.kind==='text'),voice=joined.data.channels.find(c=>c.kind==='voice');
  assert.ok(text&&voice);
  assert.equal((await outsider('/api/v1/communities/'+id+'/channels/'+text.id+'/messages')).status,403);
  assert.equal((await member('/api/v1/communities/'+id+'/channels/'+voice.id+'/messages')).status,404);
  const add=await owner('/api/v1/communities/'+id+'/channels','POST',{name:'projetos',kind:'text'});
  assert.equal(add.status,201);
  assert.equal((await owner('/api/v1/communities/'+id+'/channels','POST',{name:'projetos',kind:'text'})).status,409);
  const path='/api/v1/communities/'+id+'/channels/'+text.id+'/messages';
  assert.equal((await anonymous('/api/v1/communities/events')).status,401);
  assert.equal((await owner('/api/v1/communities/events')).status,406);
  const streamController=new AbortController();
  const streamTimeout=setTimeout(()=>streamController.abort(),10000);
  const stream=await fetch(base+'/api/v1/communities/events',{
    headers:{cookie:owner.cookie(),accept:'text/event-stream'},
    signal:streamController.signal,
  });
  assert.equal(stream.status,200);
  const reader=stream.body.getReader(), decoder=new TextDecoder();
  let streamed='';
  async function receive(fragment){
    while(!streamed.includes(fragment)){
      const chunk=await reader.read();
      if(chunk.done)throw Error('Community stream ended before '+fragment);
      streamed+=decoder.decode(chunk.value,{stream:true});
    }
  }
  await receive('event: ready');
  const clientId=crypto.randomUUID();
  const sent=await member(path,'POST',{clientId,body:'Hello community'});
  assert.equal(sent.status,201,JSON.stringify(sent.data));
  await receive('"channelId":"'+text.id+'"');
  assert.match(streamed,/event: community-update/);
  assert.match(streamed,/"kind":"message"/);
  streamController.abort();clearTimeout(streamTimeout);
  const duplicate=await member(path,'POST',{clientId,body:'Hello community'});
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.data.id,sent.data.id);
  const read=await owner(path);
  assert.equal(read.status,200);
  assert.equal(read.data.messages.find(m=>m.id===sent.data.id).body,'Hello community');
  const unread='/api/v1/communities/unread';
  assert.equal((await anonymous(unread)).status,401);
  assert.equal((await outsider(unread)).data.total,0,'nonmembers have no channel badge');
  const beforeRead=await owner(unread);
  assert.equal(beforeRead.status,200,JSON.stringify(beforeRead.data));
  assert.equal(beforeRead.data.channels[text.id],1,'a received message is unread until viewed');
  assert.equal((await owner('/api/v1/communities/'+id+'/channels/'+voice.id+'/read','POST',{lastMessageId:sent.data.id})).status,404);
  assert.equal((await outsider('/api/v1/communities/'+id+'/channels/'+text.id+'/read','POST',{lastMessageId:sent.data.id})).status,403);
  assert.equal((await owner(path.replace('/messages','/read'),'POST',{lastMessageId:sent.data.id},false)).status,403,'origin must be verified');
  assert.equal((await owner(path.replace('/messages','/read'),'POST',{lastMessageId:sent.data.id})).status,200);
  assert.equal((await owner(unread)).data.channels[text.id]??0,0,'opening a channel clears its badge');
  assert.equal((await member(unread)).data.channels[text.id]??0,0,'own message is not unread');
  const nextMessage=await member(path,'POST',{clientId:crypto.randomUUID(),body:'New message after read'});
  assert.equal(nextMessage.status,201);
  assert.equal((await owner(unread)).data.channels[text.id],1,'new messages restore the badge');
  // Re-reading an older message must never move the stored cursor backwards.
  assert.equal((await owner(path.replace('/messages','/read'),'POST',{lastMessageId:sent.data.id})).status,200);
  assert.equal((await owner(unread)).data.channels[text.id],1);
  assert.equal((await owner(path.replace('/messages','/read'),'POST',{lastMessageId:nextMessage.data.id})).status,200);
  assert.equal((await owner(unread)).data.channels[text.id]??0,0);

  assert.equal((await outsider(path,'POST',{clientId:crypto.randomUUID(),body:'outsider'})).status,403);
  assert.equal((await member(path,'POST',{clientId:crypto.randomUUID(),body:' '})).status,400);
  assert.equal((await owner('/api/v1/communities/'+id+'/membership','DELETE')).status,409);
  assert.equal((await member('/api/v1/communities/'+id+'/membership','DELETE')).status,204);
  assert.equal((await member(path)).status,403);
});

test('approval community requires a manager to accept join requests',async()=>{
  const created=await owner('/api/v1/communities','POST',{name:'Approval community',slug:'community-approval-test',visibility:'approval'});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const id=created.data.id;
  assert.equal((await member('/api/v1/communities/'+id+'/join','POST')).data.status,'pending');
  assert.equal((await member('/api/v1/communities/'+id+'/join','POST')).data.status,'pending');
  assert.equal((await outsider('/api/v1/communities/'+id+'/requests/comm_member/approve','POST')).status,403);
  const detail=await owner('/api/v1/communities/'+id);
  assert.ok(detail.data.pendingRequests.some(p=>p.handle==='comm_member'));
  assert.equal((await owner('/api/v1/communities/'+id+'/requests/comm_member/approve','POST')).status,200);
  const approved=await member('/api/v1/communities/'+id);
  assert.equal(approved.data.community.myRole,'member');
  assert.equal((await owner('/api/v1/communities/'+id+'/requests/comm_member/approve','POST')).status,404);
});

test('private communities are hidden until invitation and accepted membership',async()=>{
  const created=await owner('/api/v1/communities','POST',{name:'Secret club',slug:'secret-community-test',visibility:'private'});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const id=created.data.id;
  assert.equal((await member('/api/v1/communities')).data.communities.some(c=>c.id===id),false);
  assert.equal((await member('/api/v1/communities/'+id)).status,404);
  assert.equal((await member('/api/v1/communities/'+id+'/join','POST')).status,404);
  assert.equal((await member('/api/v1/communities/'+id+'/invite','POST',{handle:'comm_outsider'})).status,403);
  assert.equal((await owner('/api/v1/communities/'+id+'/invite','POST',{handle:'comm_member'})).status,201);
  const invited=await member('/api/v1/communities');
  const invitation=invited.data.communities.find(c=>c.id===id);
  assert.equal(invitation.requestKind,'invite');
  const invitationDetail=await member('/api/v1/communities/'+id);
  assert.equal(invitationDetail.data.channels.length,0);
  assert.equal((await member('/api/v1/communities/'+id+'/invite/accept','POST')).status,200);
  assert.equal((await member('/api/v1/communities/'+id)).data.channels.length,2);
  assert.equal((await outsider('/api/v1/communities')).data.communities.some(c=>c.id===id),false);
  assert.equal((await outsider('/api/v1/communities/'+id)).status,404);
  assert.equal((await owner('/api/v1/communities/'+id+'/invite','POST',{handle:'comm_outsider'})).status,201);
  assert.equal((await outsider('/api/v1/communities/'+id+'/invite/decline','POST')).status,200);
  assert.equal((await outsider('/api/v1/communities/'+id)).status,404);
});

test('community moderation: hierarchical roles, persistent bans, channels and message tombstones',async()=>{
  const newCommunity=await owner('/api/v1/communities','POST',{
    name:'Moderation Arena',slug:'moderation-arena-test',visibility:'public',
  });
  assert.equal(newCommunity.status,201,JSON.stringify(newCommunity.data));
  const id=newCommunity.data.id,root='/api/v1/communities/'+id;
  assert.equal((await member(root+'/join','POST')).status,200);
  assert.equal((await outsider(root+'/join','POST')).status,200);
  assert.equal((await anonymous(root+'/moderation')).status,401);
  assert.equal((await member(root+'/moderation')).status,403,'regular members cannot list roles and bans');
  const original=(await owner(root)).data.channels;
  const main=original.find(ch=>ch.kind==='text');
  assert.ok(main);
  const msgPath=root+'/channels/'+main.id+'/messages';
  const mine=await member(msgPath,'POST',{clientId:crypto.randomUUID(),body:'Original text'});
  assert.equal(mine.status,201,JSON.stringify(mine.data));
  const messageId=mine.data.id;
  assert.equal((await outsider(msgPath+'/'+messageId,'PATCH',{body:'hijacked'})).status,404,'cannot edit another writer');
  assert.equal((await outsider(msgPath+'/'+messageId,'DELETE')).status,404,'nonmoderator cannot cancel another writer');

  assert.equal((await member(root+'/members/comm_outsider/role','POST',{role:'moderator'})).status,403);
  assert.equal((await owner(root+'/members/comm_owner/role','POST',{role:'member'})).status,403,'owner role is protected');
  assert.equal((await owner(root+'/members/comm_member/role','POST',{role:'admin'},false)).status,403);
  assert.equal((await owner(root+'/members/comm_member/role','POST',{role:'admin'})).status,200);
  assert.equal((await member(root+'/members/comm_outsider/role','POST',{role:'admin'})).status,403,'admins cannot promote other admins');
  assert.equal((await member(root+'/members/comm_outsider/role','POST',{role:'moderator'})).status,200);
  assert.equal((await outsider(root+'/members/comm_member/role','POST',{role:'member'})).status,403,'moderators cannot change roles');
  assert.equal((await outsider(root+'/members/comm_owner','DELETE')).status,403,'owner cannot be kicked');
  assert.equal((await outsider(root+'/members/comm_member','DELETE')).status,403,'moderator cannot kick admin');
  const admins=await owner(root+'/moderation');
  assert.equal(admins.status,200);
  assert.ok(admins.data.members.some(m=>m.handle==='comm_member'&&m.role==='admin'));

  assert.equal((await member(root+'/channels/'+main.id,'PATCH',{name:'not allowed'},false)).status,403);
  assert.equal((await member(root+'/channels/'+main.id,'PATCH',{name:'general-chat'})).status,200);
  assert.equal((await outsider(root+'/channels/'+main.id,'PATCH',{name:'bad-name'})).status,403);
  assert.equal((await member(root+'/channels/'+main.id,'DELETE')).status,409,'last text channel cannot be deleted');
  const extra=await member(root+'/channels','POST',{name:'temporary-text',kind:'text'});
  assert.equal(extra.status,201);
  assert.equal((await member(root+'/channels/'+extra.data.channel.id,'DELETE')).status,204);

  const edit=await member(msgPath+'/'+messageId,'PATCH',{body:'Updated text'});
  assert.equal(edit.status,200);
  const edited=(await owner(msgPath)).data.messages.find(m=>m.id===messageId);
  assert.equal(edited.body,'Updated text');
  assert.ok(edited.editedAt);
  assert.equal(edited.canDelete,true,'community owners can remove member messages');
  assert.equal((await outsider(msgPath+'/'+messageId,'DELETE')).status,204,'moderators may cancel messages');
  const removed=(await member(msgPath)).data.messages.find(m=>m.id===messageId);
  assert.equal(removed.body,null,'deleted text must not be disclosed to clients');
  assert.ok(removed.deletedAt);
  assert.equal(removed.canEdit,false);
  assert.equal(removed.canDelete,false);
  assert.equal((await member(msgPath+'/'+messageId,'PATCH',{body:'restore'})).status,404);
  assert.equal((await owner(msgPath+'/'+messageId,'DELETE')).status,404);

  assert.equal((await owner(root+'/members/comm_member/role','POST',{role:'member'})).status,200);
  assert.equal((await outsider(root+'/bans','POST',{handle:'comm_member',reason:'Rule violation'},false)).status,403);
  assert.equal((await outsider(root+'/bans','POST',{handle:'comm_member',reason:'Rule violation'})).status,200);
  assert.equal((await member(root+'/join','POST')).status,404,'banned accounts cannot rejoin public communities');
  assert.equal((await member(root)).status,404,'banned accounts cannot view their former community');
  assert.equal((await member(msgPath)).status,403,'banned account loses message history access');
  const view=await owner(root+'/moderation');
  assert.ok(view.data.bans.some(b=>b.handle==='comm_member'&&b.reason==='Rule violation'));
  assert.equal((await outsider(root+'/bans/comm_member','DELETE')).status,403,'moderators cannot unban');
  assert.equal((await owner(root+'/bans/comm_member','DELETE')).status,204);
  assert.equal((await member(root+'/join','POST')).status,200,'unbanned member may explicitly rejoin');
  assert.equal((await owner(root+'/members/comm_outsider','DELETE')).status,200,'owner can remove moderator');
  assert.equal((await outsider(msgPath)).status,403,'kicked participant cannot read messages');
  assert.equal((await outsider(root+'/moderation')).status,403);
});

test('community share link: onboarding redemption, role gates, rotation, bans and expiry',async()=>{
  const newAccount=visitor(),secondAccount=member;
  const created=await owner('/api/v1/communities','POST',
    {name:'Shared Private Room',slug:'shared-private-room-test',visibility:'private',description:'Invite-only area'});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const id=created.data.id,path='/api/v1/communities/'+id;
  assert.equal((await anonymous(path+'/share')).status,401);
  assert.equal((await outsider(path+'/share')).status,403);
  assert.equal((await member(path+'/share','POST',{})).status,403);
  const share=await owner(path+'/share','POST',{},false);
  assert.equal(share.status,403,'same-origin required');
  const made=await owner(path+'/share','POST',{});
  assert.equal(made.status,201,JSON.stringify(made.data));
  const token=made.data.link.id;
  assert.match(token,/^[0-9a-f-]{36}$/);
  const preview=await anonymous('/api/v1/community-invites/'+token);
  assert.equal(preview.status,200);
  assert.equal(preview.data.community.name,'Shared Private Room');
  assert.equal(preview.data.community.communityId,id);
  assert.equal((await anonymous('/api/v1/community-invites/'+token+'/redeem','POST',{})).status,401);
  assert.equal((await outsider('/api/v1/community-invites/'+token+'/redeem','POST',{},false)).status,403);
  assert.equal((await newAccount('/api/v1/community-invites/'+token+'/redeem','POST',{})).status,401);
  await signUp(newAccount,'comm_new_shared');
  assert.equal((await newAccount(path)).status,404,'private group hidden before invitation redemption');
  const redeemed=await newAccount('/api/v1/community-invites/'+token+'/redeem','POST',{});
  assert.equal(redeemed.status,200,JSON.stringify(redeemed.data));
  assert.equal(redeemed.data.communityId,id);
  assert.equal((await newAccount(path)).data.community.myRole,'member','new user enters directly after onboarding');
  assert.equal((await newAccount('/api/v1/community-invites/'+token+'/redeem','POST',{})).status,200,
    'same link can be safely redeemed again');
  assert.equal((await newAccount(path+'/share')).data.link.id,token,
    'members can copy active link, but cannot rotate it');
  assert.equal((await newAccount(path+'/share','POST',{})).status,403);

  const invalid=await owner(path,'PATCH',{name:'Updated shared room',description:'New description'});
  assert.equal(invalid.status,200);
  assert.equal(invalid.data.community.name,'Updated shared room');
  assert.equal((await newAccount(path,'PATCH',{name:'Hijack'})).status,403);
  const avatar='/media/community/'+id+'/'+crypto.randomUUID()+'.png';
  assert.equal((await owner(path,'PATCH',{avatarUrl:avatar})).status,200);
  assert.equal((await newAccount(path)).data.community.avatarUrl,avatar);
  assert.equal((await outsider(path+'/media/upload-access')).status,403);
  assert.equal((await owner(path+'/media/upload-access')).status,200);
  const asset=avatar.split('/').at(-1);
  assert.equal((await owner(path+'/media/'+asset+'/access')).status,200);
  assert.equal((await outsider(path+'/media/'+asset+'/access')).status,404);
  assert.equal((await owner(path,'PATCH',{avatarUrl:'/media/community/'+crypto.randomUUID()+'/wrong.png'})).status,400);
  const rotated=await owner(path+'/share','POST',{});
  assert.equal(rotated.status,201);
  assert.notEqual(rotated.data.link.id,token);
  assert.equal((await anonymous('/api/v1/community-invites/'+token)).status,404);
  assert.equal((await secondAccount('/api/v1/community-invites/'+token+'/redeem','POST',{})).status,410);
  assert.equal((await secondAccount('/api/v1/community-invites/'+rotated.data.link.id+'/redeem','POST',{})).status,200);
  assert.equal((await owner(path+'/bans','POST',{handle:'comm_member'})).status,200);
  assert.equal((await secondAccount('/api/v1/community-invites/'+rotated.data.link.id+'/redeem','POST',{})).status,403,
    'ban cannot be circumvented using a fresh link');
  assert.equal((await owner(path+'/share','DELETE')).status,200);
  assert.equal((await anonymous('/api/v1/community-invites/'+rotated.data.link.id)).status,404);
  assert.equal((await newAccount(path,'DELETE')).status,403,'members cannot delete group');
  assert.equal((await owner(path,'DELETE')).status,200,'owner may permanently delete community');
  assert.equal((await anonymous('/api/v1/community-invites/'+rotated.data.link.id)).status,404);
});

test('community visibility can be changed by admins without removing existing members',async()=>{
  const created=await owner('/api/v1/communities','POST',{
    name:'Visibility tests',slug:'visibility-moderation-test',visibility:'public'
  });
  assert.equal(created.status,201,JSON.stringify(created.data));
  const path='/api/v1/communities/'+created.data.id;
  assert.equal((await member(path+'/join','POST')).status,200);
  assert.equal((await outsider(path)).status,200,'public community is discoverable');

  assert.equal((await member(path,'PATCH',{visibility:'private'})).status,403,'members cannot change privacy');
  assert.equal((await owner(path,'PATCH',{visibility:'hidden'})).status,400,'invalid visibility is rejected');
  assert.equal((await owner(path,'PATCH',{visibility:'private'},false)).status,403,'CSRF origin remains required');
  const hidden=await owner(path,'PATCH',{visibility:'private'});
  assert.equal(hidden.status,200,JSON.stringify(hidden.data));
  assert.equal(hidden.data.community.visibility,'private');
  assert.equal((await outsider(path)).status,404,'a private community is hidden from outsiders');
  assert.equal((await member(path)).data.community.myRole,'member','existing members stay in the community');

  const requested=await owner(path,'PATCH',{visibility:'approval'});
  assert.equal(requested.status,200);
  assert.equal((await outsider(path)).status,200,'approval communities are discoverable');
  assert.equal((await outsider(path+'/join','POST')).data.status,'pending');
  assert.ok((await owner(path)).data.pendingRequests.some(row=>row.handle==='comm_outsider'));

  const opened=await owner(path,'PATCH',{visibility:'public'});
  assert.equal(opened.status,200);
  assert.equal(opened.data.community.visibility,'public');
  assert.equal((await owner(path)).data.pendingRequests.some(row=>row.handle==='comm_outsider'),false,
    'pending join requests are cleared on opening the community');
  assert.equal((await outsider(path+'/join','POST')).data.status,'member');
});

test('community emoji reactions persist, count uniquely and respect message access',async()=>{
  const lurker=visitor();
  await signUp(lurker,'reaction_lurker');
  const created=await owner('/api/v1/communities','POST',{
    name:'Reaction Arena',slug:'reaction-arena-integration',visibility:'public'
  });
  assert.equal(created.status,201,JSON.stringify(created.data));
  const root='/api/v1/communities/'+created.data.id;
  const channel=(await owner(root)).data.channels.find(c=>c.kind==='text');
  assert.ok(channel);
  const messages=root+'/channels/'+channel.id+'/messages';
  const sent=await owner(messages,'POST',{clientId:crypto.randomUUID(),body:'Vote with reactions'});
  assert.equal(sent.status,201,JSON.stringify(sent.data));
  const url=messages+'/'+sent.data.id+'/reactions';
  assert.equal((await owner(messages)).data.messages.at(-1).canReact,false,'cannot react to own message');
  assert.equal((await anonymous(url,'PUT',{emoji:'👍'})).status,401);
  assert.equal((await lurker(url,'PUT',{emoji:'👍'})).status,403,'nonmembers cannot react');
  assert.equal((await owner(url,'PUT',{emoji:'👍'})).status,403,'authors cannot react to themselves');
  assert.equal((await member(root+'/join','POST')).status,200);
  assert.equal((await outsider(root+'/join','POST')).status,200);
  assert.equal((await member(url,'PUT',{emoji:'text'})).status,400);
  assert.equal((await member(url,'PUT',{emoji:'👍'},false)).status,403,'origin check applies');
  assert.equal((await member(url,'PUT',{emoji:'👍'})).status,200);
  assert.equal((await member(url,'PUT',{emoji:'👍'})).status,200,'retries cannot double-count');
  const both=await outsider(url,'PUT',{emoji:'👍'});
  assert.equal(both.status,200,JSON.stringify(both.data));
  assert.equal(both.data.reactions.find(r=>r.emoji==='👍').count,2);
  assert.equal((await outsider(url,'PUT',{emoji:'🔥'})).status,200,'other emojis are independently selectable');
  const memberView=(await member(messages)).data.messages.find(m=>m.id===sent.data.id);
  const ownerView=(await owner(messages)).data.messages.find(m=>m.id===sent.data.id);
  assert.equal(memberView.reactions.find(r=>r.emoji==='👍').count,2);
  assert.equal(memberView.reactions.find(r=>r.emoji==='👍').mine,true);
  assert.equal(memberView.reactions.find(r=>r.emoji==='🔥').mine,false);
  assert.equal(ownerView.reactions.find(r=>r.emoji==='👍').mine,false);
  assert.equal(ownerView.canReact,false);
  assert.equal((await member(url,'DELETE',{emoji:'👍'})).status,200);
  assert.equal((await member(url,'DELETE',{emoji:'👍'})).status,200,'removal is idempotent');
  const after=(await owner(messages)).data.messages.find(m=>m.id===sent.data.id);
  assert.equal(after.reactions.find(r=>r.emoji==='👍').count,1);
  assert.equal(after.reactions.find(r=>r.emoji==='🔥').count,1);
  assert.equal((await owner(messages+'/'+sent.data.id,'DELETE')).status,204);
  const tombstone=(await outsider(messages)).data.messages.find(m=>m.id===sent.data.id);
  assert.deepEqual(tombstone.reactions,[],'cancelled messages hide reactions');
  assert.equal(tombstone.canReact,false);
  assert.equal((await member(url,'PUT',{emoji:'👍'})).status,404,'cancelled messages cannot receive reactions');
  assert.equal((await member(url,'DELETE',{emoji:'🔥'})).status,404);
});


test('community attachments require signed R2 proof and are private to channel members',async()=>{
  const created=await owner('/api/v1/communities','POST',{
    name:'Community files test',slug:'community-files-test',visibility:'public'
  });
  assert.equal(created.status,201,JSON.stringify(created.data));
  const id=created.data.id;
  const detail=await owner('/api/v1/communities/'+id);
  const channel=detail.data.channels.find(c=>c.kind==='text');
  const basePath='/api/v1/communities/'+id+'/channels/'+channel.id;
  const attachment={id:crypto.randomUUID(),name:'voice.ogg',type:'audio/ogg',size:144};
  const clientId=crypto.randomUUID();
  const payload={clientId,body:'',attachment};
  assert.equal((await owner(basePath+'/messages','POST',payload)).status,403,'client cannot invent uploaded R2 object');
  assert.equal((await anonymous(basePath+'/attachments/allowed')).status,401);
  assert.equal((await outsider(basePath+'/attachments/allowed')).status,403);
  assert.equal((await owner(basePath+'/attachments/allowed')).status,200);
  const secret=process.env.DM_ATTACHMENT_PROOF_SECRET;
  assert.ok(secret&&secret.length>=32,'test signing secret must be set');
  const canonical=JSON.stringify([id,channel.id,clientId,attachment.id,attachment.name,attachment.type,attachment.size]);
  const proof=createHmac('sha256',secret).update(canonical).digest('hex');
  const sent=await owner(basePath+'/messages','POST',payload,true,{'x-uorqui-attachment-proof':proof});
  assert.equal(sent.status,201,JSON.stringify(sent.data));
  const read=await owner(basePath+'/messages');
  assert.equal(read.status,200,JSON.stringify(read.data));
  const message=read.data.messages.find(m=>m.id===sent.data.id);
  assert.ok(message);
  assert.equal(message.body,'');
  assert.deepEqual(message.attachment,attachment);
  const access=basePath+'/attachments/'+attachment.id+'/access';
  assert.equal((await outsider(access)).status,403);
  assert.equal((await owner(access)).status,200);
  assert.equal((await owner(basePath+'/messages/'+message.id,'DELETE')).status,204);
  assert.equal((await owner(access)).status,404,'removed messages cannot expose attachments');
  assert.equal((await owner(basePath+'/messages')).data.messages.find(m=>m.id===message.id).attachment,null);
});
