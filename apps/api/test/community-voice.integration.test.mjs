import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {after,before,test} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

const base='http://127.0.0.1:3052',origin='http://localhost:5173';
let server;
before(async()=>{
  server=spawn(process.execPath,['apps/api/dist/server.js'],{
    cwd:process.cwd(),stdio:'ignore',
    env:{...process.env,NODE_ENV:'test',ENABLE_DEV_SIGNUP:'true',AUTH_BASE_URL:base,WEB_ORIGIN:origin,
      CLOUDFLARE_TURN_KEY_ID:'',CLOUDFLARE_TURN_API_TOKEN:'',PORT:'3052',HOST:'127.0.0.1'},
  });
  for(let i=0;i<90;i++){
    if(server.exitCode!==null)throw Error('Voice test API exited');
    try{if((await fetch(base+'/health/ready')).ok)return;}catch{}
    await delay(250);
  }
  throw Error('Voice API startup timed out');
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
const owner=visitor(),friend=visitor(),stranger=visitor(),anon=visitor();
async function signup(user,handle){
  const name=handle;
  const r=await user('/api/auth/sign-up/email','POST',{name,email:handle+'@example.invalid',password:'correct-horse-battery-staple-demo',termsAccepted:true,privacyNoticeAcknowledged:true,termsVersion:'2026-11-01',privacyVersion:'2026-11-01'});
  assert.equal(r.status,200,JSON.stringify(r.data));
  const done=await user('/api/v1/onboarding','POST',{handle,displayName:name});
  assert.equal(done.status,201,JSON.stringify(done.data));
}

test('voice: secure joins, presence, signaling, heartbeat and leave',async()=>{
  await signup(owner,'voice_owner');
  await signup(friend,'voice_friend');
  await signup(stranger,'voice_stranger');
  const create=await owner('/api/v1/communities','POST',{name:'Voice Test',slug:'voice-test-suite',visibility:'private'});
  assert.equal(create.status,201,JSON.stringify(create.data));
  const communityId=create.data.id;
  const detail=await owner('/api/v1/communities/'+communityId);
  const voice=detail.data.channels.find(c=>c.kind==='voice');
  const text=detail.data.channels.find(c=>c.kind==='text');
  assert.ok(voice&&text);
  const room='/api/v1/communities/'+communityId+'/channels/'+voice.id+'/voice';
  const textRoom='/api/v1/communities/'+communityId+'/channels/'+text.id+'/voice';
  const a=crypto.randomUUID(),b=crypto.randomUUID();
  const presence='/api/v1/communities/'+communityId+'/voice/presence';
  assert.equal((await anon(presence)).status,401);
  assert.equal((await stranger(presence)).status,403,'nonmembers cannot view room occupants');
  assert.deepEqual((await owner(presence)).data.rooms,{},'empty rooms have no occupants');
  assert.equal((await anon(room+'/join','POST',{sessionId:a})).status,401);
  assert.equal((await owner(room+'/join','POST',{sessionId:a},false)).status,403,'origin verification');
  assert.equal((await stranger(room+'/join','POST',{sessionId:b})).status,403,'private nonmember cannot join');
  assert.equal((await owner(textRoom+'/join','POST',{sessionId:a})).status,403,'voice only, not text channels');
  const joined=await owner(room+'/join','POST',{sessionId:a});
  assert.equal(joined.status,200,JSON.stringify(joined.data));
  assert.ok(joined.data.peers.some(p=>p.sessionId===a&&p.isSelf));
  const alone=(await owner(presence)).data.rooms[voice.id];
  assert.equal(alone.length,1);
  assert.equal(alone[0].handle,'voice_owner');
  assert.equal(alone[0].isSelf,true);
  assert.equal(joined.data.maxParticipants,6);
  assert.equal(joined.data.rtc.relayAvailable,false,'TURN is not guessed or silently claimed');
  assert.ok(joined.data.rtc.iceServers[0].urls.includes('stun:stun.cloudflare.com:3478'));
  assert.equal((await stranger(room+'/state?sessionId='+a)).status,403);
  assert.equal((await friend(room+'/state?sessionId='+a)).status,403);
  assert.equal((await owner(room+'/state?sessionId='+b)).status,410);
  assert.equal((await owner(room+'/signal','POST',{sessionId:a,recipientSessionId:a,kind:'offer',payload:{type:'offer',sdp:'fake'}})).status,400);
  const badTarget=await owner(room+'/signal','POST',{sessionId:a,recipientSessionId:b,kind:'offer',payload:{type:'offer',sdp:'fake'}});
  assert.equal(badTarget.status,404);
  assert.equal((await owner(room+'/heartbeat','POST',{sessionId:a,muted:true})).status,200);
  const afterMute=await owner(room+'/state?sessionId='+a);
  assert.equal(afterMute.data.peers.find(p=>p.sessionId===a).muted,true);
  assert.equal(afterMute.data.peers.find(p=>p.sessionId===a).deafened,false);
  assert.equal((await owner(room+'/heartbeat','POST',{sessionId:a,muted:true,deafened:true})).status,200);
  const deafened=(await owner(room+'/state?sessionId='+a)).data.peers.find(p=>p.sessionId===a);
  assert.equal(deafened.muted,true);
  assert.equal(deafened.deafened,true,'server must propagate audio-off state');


  assert.equal((await owner('/api/v1/communities/'+communityId+'/invite','POST',{handle:'voice_friend'})).status,201);
  assert.equal((await friend('/api/v1/communities/'+communityId+'/invite/accept','POST')).status,200);
  const friendJoin=await friend(room+'/join','POST',{sessionId:b});
  assert.equal(friendJoin.status,200,JSON.stringify(friendJoin.data));
  assert.equal(friendJoin.data.peers.length,2);
  const roomList=(await owner(presence)).data.rooms[voice.id];
  assert.deepEqual(roomList.map(p=>p.handle),['voice_owner','voice_friend']);
  assert.equal(roomList[0].deafened,true,'main-room roster uses the persisted deafen state');
  assert.equal((await friend(presence)).data.rooms[voice.id].length,2);
  assert.equal(friendJoin.data.peers.find(p=>p.sessionId===a).deafened,true,
    'another participant must see deafen, not just mic mute');
  assert.equal((await owner(room+'/heartbeat','POST',{sessionId:a,muted:false,deafened:false})).status,200);
  assert.equal((await friend(room+'/state?sessionId='+b)).data.peers.find(p=>p.sessionId===a).deafened,false);

  assert.equal((await stranger(room+'/heartbeat','POST',{sessionId:b,muted:false})).status,410);
  assert.equal((await friend(room+'/heartbeat','POST',{sessionId:a,muted:false})).status,410,'session ownership is enforced');
  assert.equal((await stranger(room+'/signal','POST',{sessionId:a,recipientSessionId:b,kind:'offer',payload:{type:'offer',sdp:'fake'}})).status,404);
  const offer=await friend(room+'/signal','POST',{sessionId:b,recipientSessionId:a,kind:'offer',payload:{type:'offer',sdp:'example-offer'}});
  assert.equal(offer.status,201,JSON.stringify(offer.data));
  const incoming=await owner(room+'/state?sessionId='+a+'&after=0');
  assert.equal(incoming.status,200);
  assert.equal(incoming.data.signals.length,1);
  assert.equal(incoming.data.signals[0].senderSessionId,b);
  assert.equal(incoming.data.signals[0].kind,'offer');
  const cursor=incoming.data.cursor;
  assert.equal((await owner(room+'/state?sessionId='+a+'&after='+cursor)).data.signals.length,0);
  assert.equal((await friend(room+'/state?sessionId='+b)).data.signals.length,0,'signal cannot leak to others');
  assert.equal((await owner(room+'/signal','POST',{sessionId:a,recipientSessionId:b,kind:'candidate',payload:{candidate:42}})).status,400);
  assert.equal((await owner(room+'/signal','POST',{sessionId:a,recipientSessionId:b,kind:'answer',payload:{type:'offer',sdp:'wrong'}})).status,400);
  assert.equal((await owner(room+'/signal','POST',{sessionId:a,recipientSessionId:b,kind:'answer',payload:{type:'answer',sdp:'example-answer'}})).status,201);
  const received=await friend(room+'/state?sessionId='+b);
  assert.equal(received.data.signals[0].kind,'answer');
  assert.equal((await owner(room+'/heartbeat','POST',{sessionId:a,muted:false},false)).status,403);

  assert.equal((await owner('/api/v1/blocks','POST',{handle:'voice_friend'})).status,200);
  const hidden=await owner(room+'/state?sessionId='+a);
  assert.equal(hidden.data.peers.length,1,'blocked participants must not be visible to each other');
  assert.equal((await owner(presence)).data.rooms[voice.id].length,1,'the channel list must also honor blocks');
  assert.equal((await friend(room+'/state?sessionId='+b)).data.peers.length,1);
  assert.equal((await owner(room+'/signal','POST',{sessionId:a,recipientSessionId:b,kind:'candidate',payload:{candidate:'candidate:sample',sdpMid:'0',sdpMLineIndex:0}})).status,404,
    'a blocked pair cannot exchange WebRTC candidates');
  assert.equal((await owner('/api/v1/blocks/voice_friend','DELETE')).status,204);
  assert.equal((await friend(room+'/state?sessionId='+b)).data.peers.length,2,
    'unblocked participants can see their peers again');

  assert.equal((await friend(room+'/sessions/'+a,'DELETE')).status,204,'cannot remove someone else');
  assert.equal((await owner(room+'/state?sessionId='+a)).status,200);
  assert.equal((await owner(room+'/sessions/'+a,'DELETE',undefined,false)).status,403);
  assert.equal((await owner(room+'/sessions/'+a,'DELETE')).status,204);
  assert.equal((await owner(room+'/state?sessionId='+a)).status,410);
  const remaining=await friend(room+'/state?sessionId='+b);
  assert.equal(remaining.data.peers.length,1);
  assert.equal((await friend(room+'/sessions/'+b,'DELETE')).status,204);
  assert.deepEqual((await owner(presence)).data.rooms,{},'leaving must clear the main-screen roster');
  assert.equal((await friend(room+'/state?sessionId='+b)).status,410);
});

test('meeting: direct entry, approval gates, invitations and community request notifications',async()=>{
  const communities=(await owner('/api/v1/communities')).data.communities;
  const group=communities.find(c=>c.slug==='voice-test-suite');
  assert.ok(group);
  const prefix='/api/v1/communities/'+group.id;
  const created=await owner(prefix+'/channels','POST',{name:'video-review',kind:'meeting'});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const channelId=created.data.channel.id;
  const meeting=prefix+'/channels/'+channelId+'/meeting';
  const rtc=prefix+'/channels/'+channelId+'/voice';
  const first=crypto.randomUUID();
  assert.equal((await friend(meeting)).data.policy,'open','new meetings use direct entry by default');
  assert.equal((await friend(rtc+'/join','POST',{sessionId:first})).status,200);
  assert.equal((await friend(rtc+'/sessions/'+first,'DELETE')).status,204);
  // An authenticated community member must still unlock a password-protected
  // video room before joining or exchanging WebRTC signals.
  assert.equal((await owner(prefix+'/channels/'+channelId+'/password','PUT',{password:'meeting-safe-1234'})).status,200);
  assert.equal((await friend(rtc+'/join','POST',{sessionId:crypto.randomUUID()})).status,403);
  assert.equal((await friend(prefix+'/channels/'+channelId+'/unlock','POST',{password:'meeting-safe-1234'})).status,200);
  const secureSession=crypto.randomUUID();
  assert.equal((await friend(rtc+'/join','POST',{sessionId:secureSession})).status,200);
  assert.equal((await friend(rtc+'/sessions/'+secureSession,'DELETE')).status,204);
  assert.equal((await owner(prefix+'/channels/'+channelId+'/password','PUT',{password:null})).status,200);
  assert.equal((await stranger(meeting)).status,404,'nonmembers cannot inspect meeting policy');
  assert.equal((await friend(meeting+'/policy','PUT',{policy:'approval'})).status,403,'only administrators set admission policy');
  assert.equal((await owner(meeting+'/policy','PUT',{policy:'approval'})).status,200);
  const denied=await friend(rtc+'/join','POST',{sessionId:crypto.randomUUID()});
  assert.equal(denied.status,403);
  assert.equal(denied.data.error,'MEETING_APPROVAL_REQUIRED');
  const request=await friend(meeting+'/requests','POST');
  assert.equal(request.status,201,JSON.stringify(request.data));
  assert.equal(request.data.status,'pending');
  assert.equal((await friend(meeting+'/requests','POST')).data.status,'pending','do not resend a pending request');
  const requests=(await owner(meeting)).data.pending;
  assert.deepEqual(requests.map(r=>r.handle),['voice_friend']);
  const inbox=(await owner('/api/v1/notifications')).data.notifications;
  assert.ok(inbox.some(n=>n.kind==='meeting_join_request'&&n.targetId===channelId&&n.communityId===group.id),
    'admins should see meeting requests with the meeting deep link: '+JSON.stringify(inbox));
  assert.equal((await friend(meeting+'/requests/voice_friend/approve','POST')).status,403);
  assert.equal((await owner(meeting+'/requests/voice_friend/approve','POST')).status,200);
  const approved=crypto.randomUUID();
  assert.equal((await friend(rtc+'/join','POST',{sessionId:approved})).status,200,
    'approved member can join');
  assert.equal((await friend(rtc+'/sessions/'+approved,'DELETE')).status,204);
  assert.equal((await owner(meeting+'/policy','PUT',{policy:'open'})).status,200);
  assert.equal((await owner(meeting+'/policy','PUT',{policy:'approval'})).status,200);

  const approval=await owner('/api/v1/communities','POST',{name:'Approvals Test',slug:'community-approvals-suite',visibility:'approval'});
  assert.equal(approval.status,201);
  const joined=await stranger('/api/v1/communities/'+approval.data.id+'/join','POST');
  assert.equal(joined.status,201);
  assert.equal(joined.data.status,'pending');
  assert.ok((await owner('/api/v1/notifications')).data.notifications.some(n=>
    n.kind==='community_join_request'&&n.targetId===approval.data.id),
    'community administrators should receive join requests');
  const prefs=(await owner('/api/v1/notifications/preferences')).data.preferences;
  assert.equal(prefs.community_request,true);
  assert.equal((await owner('/api/v1/notifications/preferences','PUT',{...prefs,community_request:false})).status,200);
  assert.equal((await owner('/api/v1/notifications/preferences')).data.preferences.community_request,false);
});

test('voice: lost membership ends active RTC room access',async()=>{
  const list=(await friend('/api/v1/communities')).data.communities;
  const c=list.find(x=>x.slug==='voice-test-suite');
  const details=await friend('/api/v1/communities/'+c.id);
  const voice=details.data.channels.find(x=>x.kind==='voice');
  const root='/api/v1/communities/'+c.id+'/channels/'+voice.id+'/voice';
  const s=crypto.randomUUID();
  assert.equal((await friend(root+'/join','POST',{sessionId:s})).status,200);
  assert.equal((await friend('/api/v1/communities/'+c.id+'/membership','DELETE')).status,204);
  assert.equal((await friend('/api/v1/communities/'+c.id+'/voice/presence')).status,403);
  assert.equal((await friend(root+'/state?sessionId='+s)).status,403);
  assert.equal((await friend(root+'/heartbeat','POST',{sessionId:s,muted:false})).status,410);
  assert.equal((await friend(root+'/sessions/'+s,'DELETE')).status,204,'safe cleanup after membership removal');
});
