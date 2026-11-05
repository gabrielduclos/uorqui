/* Uorqui PWA: cache static public assets, not account data.
 * Account-bound profile/community avatars use IndexedDB in the signed-in app;
 * private conversation attachments use a bounded tab-memory cache only.
 * Never put /api, /auth, /media or navigation responses in Cache Storage. */
const CACHE='uorqui-social-shell-v2';
const STATIC_ASSET=/^\/assets\/[a-z0-9._-]+\.(?:js|css|woff2?|svg|png|jpg|jpeg|webp|avif|gif|ico|mp3|ogg|wav|mp4|webm)$/i;
const PUBLIC_BRANDING=new Set([
  '/icon.svg','/icon-192.png','/icon-512.png',
  '/notification-badge.png','/notification-badge.svg','/manifest.webmanifest'
]);
const MAX_STATIC_ENTRIES=100;
const MAX_STATIC_BYTES=8*1024*1024;

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.all([...PUBLIC_BRANDING].map(async path=>{
      try{
        const response=await fetch(path,{cache:'no-store'});
        if(response.ok)await cache.put(path,response).catch(()=>{});
      }catch{/* Offline installs still succeed. */}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('uorqui-social-shell-')&&key!==CACHE)
      .map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
async function storePublic(cache,req,response){
  if(!response.ok || response.status!==200 || response.type==='opaque')return;
  if((response.headers.get('cache-control')||'').includes('no-store'))return;
  const size=Number(response.headers.get('content-length')||0);
  if(Number.isFinite(size)&&size>MAX_STATIC_BYTES)return;
  try{
    await cache.put(req,response.clone());
    const keys=await cache.keys();
    if(keys.length>MAX_STATIC_ENTRIES)
      await Promise.all(keys.slice(0,keys.length-MAX_STATIC_ENTRIES).map(key=>cache.delete(key)));
  }catch{/* Private-mode and storage-pressure failures are safe to ignore. */}
}
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||req.headers.has('range'))return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/health/')||
     url.pathname.startsWith('/media/')||url.pathname.startsWith('/auth/')||
     url.pathname==='/index.html'||url.pathname==='/sw.js'||req.mode==='navigate')return;
  const hashed=STATIC_ASSET.test(url.pathname);
  const branding=PUBLIC_BRANDING.has(url.pathname);
  if(!hashed&&!branding)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(req);
    if(hashed){
      // Vite-hashed assets are immutable and can be used instantly on revisits.
      if(cached)return cached;
      const network=await fetch(req);
      await storePublic(cache,req,network);
      return network;
    }
    // Same-named PWA branding files can change; refresh without blocking UI.
    if(cached){
      event.waitUntil(fetch(req).then(res=>storePublic(cache,req,res)).catch(()=>{}));
      return cached;
    }
    const network=await fetch(req);
    await storePublic(cache,req,network);
    return network;
  })());
});
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function safeUrl(payload){
  // Go directly to the authorized channel, not merely the community home.
  if(payload?.kind==='community'&&uuid.test(String(payload.communityId||''))&&uuid.test(String(payload.channelId||'')))
    return '/?community='+encodeURIComponent(payload.communityId)+'&channel='+encodeURIComponent(payload.channelId);
  if(payload?.kind==='dm'&&uuid.test(String(payload.conversationId||'')))return '/?conversation='+encodeURIComponent(payload.conversationId);
  if(payload?.kind==='community-invite'&&uuid.test(String(payload.communityId||'')))return '/?communityInvite='+encodeURIComponent(payload.communityId);
  if(payload?.kind==='activity'&&uuid.test(String(payload.notificationId||'')))return '/?notification='+encodeURIComponent(payload.notificationId);
  if(payload?.kind==='mail'&&uuid.test(String(payload.accountId||''))&&
     /^[A-Za-z0-9_=+\/\-]{1,1024}$/.test(String(payload.messageId||'')))
    return '/?mailAccount='+encodeURIComponent(payload.accountId)+'&mailMessage='+encodeURIComponent(payload.messageId);
  return '/';
}
async function account(){
  try{
    const response=await fetch('/api/v1/me',{credentials:'include',cache:'no-store'});
    if(!response.ok)return null;
    const body=await response.json();
    return typeof body?.user?.id==='string'?body.user.id:null;
  }catch{return null;}
}
async function acknowledge(payload){
  if(payload.kind!=='dm'||!uuid.test(String(payload.messageId||''))||
     !uuid.test(String(payload.conversationId||''))||typeof payload.proof!=='string')return;
  try{await fetch('/api/v1/push/delivered',{
    method:'POST',credentials:'include',cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({messageId:payload.messageId,conversationId:payload.conversationId,proof:payload.proof})
  });}catch{/* A missing receipt must not block a visible notification. */}
}
self.addEventListener('push',event=>{event.waitUntil((async()=>{
  let payload;
  try{payload=event.data?.json();}catch{return;}
  if(!payload||!uuid.test(String(payload.recipientId||'')))return;
  // A queued push must never reveal another account's activity after sign out.
  if(await account()!==payload.recipientId)return;
  if(payload.kind==='community'||payload.kind==='community-invite'){
    const communityId=String(payload.communityId||'');
    const channelId=String(payload.channelId||'');
    if(!uuid.test(communityId)||(payload.kind==='community'&&!uuid.test(channelId)))return;
    // Delayed pushes must be authorized at display time, not only when queued.
    // Invitation or closed-channel access can be revoked in the meantime.
    const endpoint=payload.kind==='community'
      ?'/api/v1/communities/'+encodeURIComponent(communityId)+'/channels/'+encodeURIComponent(channelId)+'/notification-access'
      :'/api/v1/communities/'+encodeURIComponent(communityId)+'/invite/notification-access';
    try{
      const result=await fetch(endpoint,{credentials:'include',cache:'no-store'});
      if(!result.ok)return;
      const access=await result.json();
      if(access?.authorized!==true)return;
    }catch{return;} // Fail closed when offline or authorization is unavailable.
  }
  if(payload.kind==='mail'){
    // The account could have been disconnected between enqueue and delivery.
    if(!uuid.test(String(payload.accountId||'')) ||
       !/^[A-Za-z0-9_=+\/\-]{1,1024}$/.test(String(payload.messageId||'')))return;
    try{
      const access=await fetch('/api/v1/mail/accounts/'+encodeURIComponent(payload.accountId)+'/notification-access',
        {credentials:'include',cache:'no-store'});
      if(!access.ok||(await access.json())?.authorized!==true)return;
    }catch{return;}
  }
  const title=typeof payload.title==='string'?payload.title.slice(0,80):'Uorqui';
  const body=typeof payload.body==='string'?payload.body.slice(0,180):'Nova atividade';
  const tag=payload.kind==='dm'&&uuid.test(String(payload.conversationId||''))
    ?'uorqui-dm-'+payload.conversationId
    :payload.kind==='community'&&uuid.test(String(payload.channelId||''))
      ?'uorqui-community-'+payload.channelId:payload.kind==='community-invite'&&uuid.test(String(payload.communityId||''))
        ?'uorqui-invite-'+payload.communityId:payload.kind==='mail'&&uuid.test(String(payload.accountId||''))
        ?'uorqui-mail-'+payload.accountId+'-'+String(payload.messageId||'').slice(0,64):payload.kind==='activity'&&uuid.test(String(payload.notificationId||''))
        ?'uorqui-activity-'+payload.notificationId:'uorqui-activity';
  const url=safeUrl(payload);
  try{
    // Foreground pages get a compact in-app alert instead of both an OS
    // notification and a duplicate UI alert. The PWA keeps normal OS push
    // behavior when minimized, locked, or closed.
    const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const visible=pages.filter(client=>client.visibilityState==='visible');
    if(visible.length){
      const notice={type:'uorqui:foreground-push',recipientId:payload.recipientId,
        kind:payload.kind,title,body,url,messageId:payload.messageId||'',
        channelId:payload.channelId||'',notificationId:payload.notificationId||''};
      visible.forEach(client=>client.postMessage(notice));
      if(payload.kind==='activity'||payload.kind==='community'||payload.kind==='community-invite'||payload.kind==='mail'){
        const type=payload.kind==='mail'?'uorqui:mail-push-update':payload.kind==='activity'?'uorqui:activity-update':'uorqui:community-push-update';
        visible.forEach(client=>client.postMessage({type}));
      }
      return;
    }
    // Confirm receipt only after the browser accepts the visible notification.
    await self.registration.showNotification(title,{
      body,icon:'/icon-192.png',badge:'/notification-badge.png',tag,renotify:false,
      data:{url,kind:payload.kind,conversationId:payload.conversationId||'',messageId:payload.messageId||''}
    });
    await acknowledge(payload);
    if(payload.kind==='activity'||payload.kind==='community'||payload.kind==='community-invite'||payload.kind==='mail'){
      const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      const type=payload.kind==='mail'?'uorqui:mail-push-update':payload.kind==='activity'?'uorqui:activity-update':'uorqui:community-push-update';
      pages.forEach(client=>client.postMessage({type}));
    }
  }catch{/* Unsupported browser notifications cannot claim delivery. */}
})());});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const path=event.notification.data?.url||'/';
    const destination=new URL(path,self.location.origin);
    if(destination.origin!==self.location.origin)return;
    const url=destination.href;
    const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const client=pages.find(page=>page.focused)||pages.find(page=>page.visibilityState==='visible')||pages[0];
    if(client){
      // postMessage after focus is unreliable on iOS: a frozen/terminated PWA
      // may silently discard it. Navigate the client with the deep link so
      // its URL survives a process restart and the app can restore the target.
      try{
        const navigated=await client.navigate(url);
        if(navigated){await navigated.focus();return;}
      }catch{/* Some browsers reject navigate() for stale clients. */}
    }
    await self.clients.openWindow(url);
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type!=='uorqui:clear-dm-push')return;
  const id=String(event.data.conversationId||'');
  if(!uuid.test(id))return;
  event.waitUntil(self.registration.getNotifications({tag:'uorqui-dm-'+id})
    .then(notifications=>notifications.forEach(notification=>notification.close())).catch(()=>{}));
});
