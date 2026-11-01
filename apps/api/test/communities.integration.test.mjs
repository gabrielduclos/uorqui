import assert from 'node:assert/strict';
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
  return async(path,method='GET',payload,withOrigin=true)=>{
    const response=await fetch(base+path,{
      method,headers:{...(withOrigin?{origin}:{}),...(payload?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{})
    });
    for(const val of response.headers.getSetCookie()){
      const entry=val.split(';')[0],key=entry.split('=')[0];
      cookie=[...cookie.split(';').filter(Boolean).filter(x=>x.split('=')[0]!==key),entry].join('; ');
    }
    return {status:response.status,data:await response.json().catch(()=>null)};
  };
}
const owner=visitor(),member=visitor(),outsider=visitor(),anonymous=visitor();
async function signUp(user,handle){
  const r=await user('/api/auth/sign-up/email','POST',{
    name:handle,email:handle+'@example.invalid',password:'correct-horse-battery-staple-demo'
  });
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
  const clientId=crypto.randomUUID();
  const sent=await member(path,'POST',{clientId,body:'Hello community'});
  assert.equal(sent.status,201,JSON.stringify(sent.data));
  const duplicate=await member(path,'POST',{clientId,body:'Hello community'});
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.data.id,sent.data.id);
  const read=await owner(path);
  assert.equal(read.status,200);
  assert.equal(read.data.messages.find(m=>m.id===sent.data.id).body,'Hello community');
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
