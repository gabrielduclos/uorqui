import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {after,before,test} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

const base='http://127.0.0.1:3060',origin='http://localhost:5173';
const secret='test-only-feed-media-hmac-secret-1234567890';
let server;
before(async()=>{
  server=spawn(process.execPath,['apps/api/dist/server.js'],{
    cwd:process.cwd(),stdio:'ignore',
    env:{...process.env,NODE_ENV:'test',ENABLE_DEV_SIGNUP:'true',AUTH_BASE_URL:base,
      WEB_ORIGIN:origin,HOST:'127.0.0.1',PORT:'3060',DM_ATTACHMENT_PROOF_SECRET:secret}
  });
  for(let i=0;i<90;i++){
    if(server.exitCode!==null)throw Error('Feed API server exited');
    try{if((await fetch(base+'/health/ready')).ok)return;}catch{}
    await delay(250);
  }
  throw Error('Feed API startup timed out');
});
after(async()=>{if(server?.exitCode===null){server.kill('SIGTERM');await delay(300);if(server.exitCode===null)server.kill('SIGKILL');}});
function visitor(){
  let cookie='';
  return async(path,method='GET',payload,withOrigin=true,extraHeaders={})=>{
    const r=await fetch(base+path,{
      method,headers:{...(withOrigin?{origin}:{}),...(payload?{'Content-Type':'application/json'}:{}),
        ...(cookie?{cookie}:{}),...extraHeaders},
      ...(payload?{body:JSON.stringify(payload)}:{})
    });
    for(const value of r.headers.getSetCookie()){
      const entry=value.split(';')[0],key=entry.split('=')[0];
      cookie=[...cookie.split(';').filter(Boolean).filter(v=>v.split('=')[0]!==key),entry].join('; ');
    }
    return {status:r.status,data:await r.json().catch(()=>null)};
  };
}
const owner=visitor(),friend=visitor(),stranger=visitor(),guest=visitor();
async function signup(user,handle){
  let result=await user('/api/auth/sign-up/email','POST',{
    name:handle,email:handle+'@example.invalid',password:'correct-horse-battery-staple-feed'
  });
  assert.equal(result.status,200,JSON.stringify(result.data));
  result=await user('/api/v1/onboarding','POST',{handle,displayName:handle});
  assert.equal(result.status,201,JSON.stringify(result.data));
}

test('feed: authenticated publication, scrolling, likes, comments, deletion and privacy',async()=>{
  await signup(owner,'feed_owner');
  await signup(friend,'feed_friend');
  await signup(stranger,'feed_stranger');
  assert.equal((await guest('/api/v1/feed/posts')).status,401);
  assert.equal((await owner('/api/v1/feed/posts','POST',{body:'x',mediaCount:0},false)).status,403);
  assert.equal((await owner('/api/v1/feed/posts','POST',{body:'  ',mediaCount:0})).status,400);
  const created=await owner('/api/v1/feed/posts','POST',{body:'Hello from the real feed',mediaCount:0});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const id=created.data.post.id;
  const listed=await stranger('/api/v1/feed/posts');
  assert.equal(listed.status,200,JSON.stringify(listed.data));
  assert.ok(listed.data.posts.some(p=>p.id===id));
  const followedBefore=await stranger('/api/v1/feed/posts?filter=following');
  assert.ok(!followedBefore.data.posts.some(p=>p.id===id));
  assert.equal((await owner('/api/v1/feed/posts?cursor=garbage')).status,400);
  assert.equal((await stranger('/api/v1/feed/posts/'+id)).status,200);
  assert.equal((await stranger('/api/v1/feed/posts/'+id+'/like','PUT')).status,200);
  assert.equal((await stranger('/api/v1/feed/posts/'+id+'/like','PUT')).status,200,'idempotent like');
  assert.equal((await friend('/api/v1/feed/posts/'+id)).data.post.likeCount,1);
  assert.equal((await stranger('/api/v1/feed/posts/'+id+'/like','DELETE')).status,200);
  assert.equal((await friend('/api/v1/feed/posts/'+id)).data.post.likeCount,0);
  assert.equal((await stranger('/api/v1/feed/posts/'+id+'/comments','POST',{body:'  '})).status,400);
  const reply=await friend('/api/v1/feed/posts/'+id+'/comments','POST',{body:'Nice post'});
  assert.equal(reply.status,201,JSON.stringify(reply.data));
  const comments=await stranger('/api/v1/feed/posts/'+id+'/comments');
  assert.equal(comments.data.comments.length,1);
  assert.equal(comments.data.comments[0].body,'Nice post');
  assert.equal((await stranger('/api/v1/feed/posts/'+id+'/comments/'+reply.data.id,'DELETE')).status,404);
  assert.equal((await friend('/api/v1/feed/posts/'+id+'/comments/'+reply.data.id,'DELETE')).status,204);
  assert.equal((await owner('/api/v1/feed/posts/'+id,'PATCH',{body:'Edited feed post'})).status,200);
  assert.equal((await stranger('/api/v1/feed/posts/'+id)).data.post.body,'Edited feed post');
  assert.equal((await stranger('/api/v1/feed/posts/'+id,'DELETE')).status,404);
  // Friendship allows the "Following" tab to surface people in the user's network.
  assert.equal((await friend('/api/v1/friends/requests','POST',{handle:'feed_owner'})).status,201);
  assert.equal((await owner('/api/v1/friends/requests/feed_friend/accept','POST')).status,200);
  assert.ok((await friend('/api/v1/feed/posts?filter=following')).data.posts.some(p=>p.id===id));
  const privateProfile=await owner('/api/v1/me/profile','PATCH',{isPublic:false});
  assert.equal(privateProfile.status,200,JSON.stringify(privateProfile.data));
  assert.equal((await stranger('/api/v1/feed/posts/'+id)).status,404);
  assert.ok(!(await stranger('/api/v1/feed/posts')).data.posts.some(p=>p.id===id));
  assert.equal((await friend('/api/v1/feed/posts/'+id)).status,200);
  assert.equal((await owner('/api/v1/feed/posts/'+id,'DELETE')).status,200);
  assert.equal((await friend('/api/v1/feed/posts/'+id)).status,404);
});

test('feed: drafts, media proof, video-only filtering and attachment permissions',async()=>{
  const created=await owner('/api/v1/feed/posts','POST',{body:'My recorded video',mediaCount:1});
  assert.equal(created.status,201,JSON.stringify(created.data));
  assert.equal(created.data.post.publishedAt,null);
  const id=created.data.post.id;
  const basePath='/api/v1/feed/posts/'+id;
  assert.equal((await stranger(basePath)).status,404);
  assert.equal((await stranger(basePath+'/draft')).status,404);
  assert.equal((await stranger(basePath+'/media/0/allowed')).status,404);
  assert.equal((await owner(basePath+'/media/0/allowed')).status,200);
  const media={id:crypto.randomUUID(),type:'video/mp4',size:1234};
  assert.equal((await owner(basePath+'/media/0','POST',media)).status,403,'browser cannot link arbitrary media IDs');
  assert.equal((await owner(basePath+'/publish','POST',{})).status,409,'incomplete upload must not publish');
  const proof=createHmac('sha256',secret).update(JSON.stringify([id,0,media.id,media.type,media.size])).digest('hex');
  const uploaded=await owner(basePath+'/media/0','POST',media,true,{'x-uorqui-attachment-proof':proof});
  assert.equal(uploaded.status,201,JSON.stringify(uploaded.data));
  assert.equal((await owner(basePath+'/media/0/allowed')).status,409);
  assert.equal((await owner(basePath+'/publish','POST',{})).status,200);
  assert.equal((await stranger('/api/v1/feed/media/'+media.id+'/access')).status,404,'private author hides media');
  assert.equal((await friend('/api/v1/feed/media/'+media.id+'/access')).status,200);
  assert.ok((await friend('/api/v1/feed/posts?filter=videos')).data.posts.some(p=>p.id===id));
  assert.equal((await owner(basePath,'DELETE')).status,200);
  assert.equal((await friend('/api/v1/feed/media/'+media.id+'/access')).status,404);
});
