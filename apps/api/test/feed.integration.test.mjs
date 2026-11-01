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
  assert.equal((await owner('/api/v1/feed/posts/'+id+'/comments/'+reply.data.id,'DELETE')).status,204,
    'the owner of a post may moderate a third-party comment');
  const removed=await stranger('/api/v1/feed/posts/'+id+'/comments');
  assert.equal(removed.status,200);
  assert.equal(removed.data.comments.length,1,'deleted comment stays as a tombstone');
  assert.equal(removed.data.comments[0].deleted,true);
  assert.equal(removed.data.comments[0].body,'','deleted text must not leak');
  assert.equal(removed.data.comments[0].authorHandle,null,'deleted author identity must be hidden');
  assert.equal(removed.data.comments[0].canDelete,false);
  assert.equal((await stranger('/api/v1/feed/posts/'+id)).data.post.commentCount,0);
  assert.equal((await friend('/api/v1/feed/posts/'+id+'/comments/'+reply.data.id,'DELETE')).status,404);
  const own=await friend('/api/v1/feed/posts/'+id+'/comments','POST',{body:'Another comment'});
  assert.equal(own.status,201);
  assert.equal((await friend('/api/v1/feed/posts/'+id+'/comments/'+own.data.id,'DELETE')).status,204);
  const selfRemoved=await owner('/api/v1/feed/posts/'+id+'/comments');
  assert.equal(selfRemoved.status,200);
  const ownTombstone=selfRemoved.data.comments.find(c=>c.id===own.data.id);
  assert.ok(ownTombstone,'deleting your own comment must keep a visible placeholder');
  assert.equal(ownTombstone.deleted,true);
  assert.equal(ownTombstone.body,'','the original comment must not be visible');
  assert.equal(ownTombstone.authorName,null,'deleted comment identity must be redacted');
  assert.equal(ownTombstone.canDelete,false);
  assert.equal(selfRemoved.data.comments.length,2,'both own and moderated comments remain in place');
  assert.equal((await friend('/api/v1/feed/posts/'+id)).data.post.commentCount,0,
    'self-deleted comments do not count as active comments');
  assert.equal((await owner('/api/v1/feed/posts/'+id,'PATCH',{body:'Edited feed post'})).status,200);
  assert.equal((await stranger('/api/v1/feed/posts/'+id)).data.post.body,'Edited feed post');
  assert.equal((await stranger('/api/v1/feed/posts/'+id,'DELETE')).status,404);
  // Following is deliberately independent from friend requests.
  assert.equal((await friend('/api/v1/feed/follows/feed_owner','PUT',null,false)).status,403);
  assert.equal((await friend('/api/v1/feed/follows/feed_friend','PUT')).status,404,'no self-following');
  assert.equal((await friend('/api/v1/feed/follows/feed_owner')).data.following,false);
  assert.equal((await friend('/api/v1/feed/follows/feed_owner','PUT')).status,200);
  assert.equal((await friend('/api/v1/feed/follows/feed_owner','PUT')).status,200,'idempotent follow');
  assert.equal((await friend('/api/v1/feed/follows/feed_owner')).data.following,true);
  const stats=await stranger('/api/v1/profiles/feed_owner');
  assert.equal(stats.status,200);
  assert.equal(stats.data.profile.followersCount,1);
  assert.equal(stats.data.profile.followingCount,0);
  assert.equal(stats.data.profile.isPrivate,false);
  assert.equal((await stranger('/api/v1/profiles/feed_owner/follows/followers')).data.users[0].handle,'feed_friend');
  assert.ok((await friend('/api/v1/feed/posts?filter=following')).data.posts.some(p=>p.id===id));
  assert.equal((await friend('/api/v1/feed/follows/feed_owner','DELETE')).status,200);
  assert.ok(!(await friend('/api/v1/feed/posts?filter=following')).data.posts.some(p=>p.id===id));
  assert.equal((await friend('/api/v1/feed/follows/feed_owner','PUT')).status,200);
  // Mutual friendship unlocks posts on private profiles without granting access to strangers.
  assert.equal((await friend('/api/v1/friends/requests','POST',{handle:'feed_owner'})).status,201);
  assert.equal((await owner('/api/v1/friends/requests/feed_friend/accept','POST')).status,200);
  const privateProfile=await owner('/api/v1/me/profile','PATCH',{isPublic:false});
  assert.equal(privateProfile.status,200,JSON.stringify(privateProfile.data));
  const privateStats=await stranger('/api/v1/profiles/feed_owner');
  assert.equal(privateStats.status,200);
  assert.equal(privateStats.data.profile.isPrivate,true);
  assert.equal(privateStats.data.profile.followersCount,1,'private profile still shows true follow totals');
  assert.equal(privateStats.data.profile.followingCount,0);
  assert.equal(privateStats.data.profile.avatarUrl,null);
  assert.equal(privateStats.data.profile.bio,null);
  assert.equal((await stranger('/api/v1/profiles/feed_owner/follows/followers')).status,403);
  assert.equal((await friend('/api/v1/profiles/feed_owner/follows/following')).status,403,
    'private relationship lists stay hidden even from friends');
  assert.equal((await stranger('/api/v1/feed/follows/feed_owner','PUT')).status,403,'private profile requires friendship');
  assert.ok((await friend('/api/v1/feed/posts?filter=following')).data.posts.some(p=>p.id===id));
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
  assert.equal((await owner(basePath,'PATCH',{body:'Updated caption after interrupted upload'})).status,200);
  assert.equal((await owner(basePath+'/publish','POST',{})).status,200);
  assert.equal((await owner(basePath)).data.post.body,'Updated caption after interrupted upload');
  assert.equal((await stranger('/api/v1/feed/media/'+media.id+'/access')).status,404,'private author hides media');
  assert.equal((await friend('/api/v1/feed/media/'+media.id+'/access')).status,200);
  assert.ok((await friend('/api/v1/feed/posts?filter=videos')).data.posts.some(p=>p.id===id));
  assert.equal((await owner(basePath,'DELETE')).status,200);
  assert.equal((await friend('/api/v1/feed/media/'+media.id+'/access')).status,404);
});

test('feed: stable keyset pagination without duplicate posts',async()=>{
  const ids=[];
  for(let i=0;i<14;i++){
    const created=await owner('/api/v1/feed/posts','POST',{body:'Pagination post '+i,mediaCount:0});
    assert.equal(created.status,201,JSON.stringify(created.data));
    ids.push(created.data.post.id);
  }
  const first=await owner('/api/v1/feed/posts?filter=for-you');
  assert.equal(first.status,200);
  assert.equal(first.data.posts.length,12);
  assert.ok(first.data.nextCursor);
  const second=await owner('/api/v1/feed/posts?filter=for-you&cursor='+encodeURIComponent(first.data.nextCursor));
  assert.equal(second.status,200,JSON.stringify(second.data));
  const unique=new Set([...first.data.posts,...second.data.posts].map(p=>p.id));
  assert.ok(unique.size>=14,'the next page must include older posts');
  assert.ok(ids.every(id=>unique.has(id)),'every created post must be reachable');
});

