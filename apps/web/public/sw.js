/* Uorqui Social service worker: network-first app shell, account-bound push.
 * Adapted from the separate Uorqui Chat PWA. Never cache API/session/media. */
const CACHE='uorqui-social-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('uorqui-social-shell-')&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})());});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/health/')||
     url.pathname.startsWith('/media/')||url.pathname.startsWith('/auth/')||
     url.pathname==='/index.html'||req.mode==='navigate')return;
  if(!/^\/assets\/[\w.-]+\.(js|css|woff2?|svg|png)$/.test(url.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(req);
    if(cached)return cached;
    const response=await fetch(req);
    if(response.ok)await cache.put(req,response.clone()).catch(()=>{});
    return response;
  })());
});
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function safeUrl(payload){
  if(payload?.kind==='dm'&&uuid.test(String(payload.conversationId||'')))return '/?conversation='+encodeURIComponent(payload.conversationId);
  if(payload?.kind==='community'&&uuid.test(String(payload.communityId||'')))return '/?community='+encodeURIComponent(payload.communityId);
  if(payload?.kind==='activity'&&uuid.test(String(payload.notificationId||'')))return '/?notification='+encodeURIComponent(payload.notificationId);
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
  const title=typeof payload.title==='string'?payload.title.slice(0,80):'Uorqui';
  const body=typeof payload.body==='string'?payload.body.slice(0,180):'Nova atividade';
  const tag=payload.kind==='dm'&&uuid.test(String(payload.conversationId||''))
    ?'uorqui-dm-'+payload.conversationId
    :payload.kind==='community'&&uuid.test(String(payload.channelId||''))
      ?'uorqui-community-'+payload.channelId:payload.kind==='activity'&&uuid.test(String(payload.notificationId||''))
        ?'uorqui-activity-'+payload.notificationId:'uorqui-activity';
  const url=safeUrl(payload);
  try{
    // Confirm receipt only after the browser accepts the visible notification.
    await self.registration.showNotification(title,{
      body,icon:'/icon-192.png',badge:'/icon-192.png',tag,renotify:false,
      data:{url,kind:payload.kind,conversationId:payload.conversationId||'',messageId:payload.messageId||''}
    });
    await acknowledge(payload);
    if(payload.kind==='activity'){
      const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      pages.forEach(client=>client.postMessage({type:'uorqui:activity-update'}));
    }
  }catch{/* Unsupported browser notifications cannot claim delivery. */}
})());});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const url=event.notification.data?.url||'/';
    const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const open=clientsList.find(client=>new URL(client.url).origin===self.location.origin);
    if(open){
      await open.focus();
      open.postMessage({type:'uorqui:push-open',url});
    }else await self.clients.openWindow(url);
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type!=='uorqui:clear-dm-push')return;
  const id=String(event.data.conversationId||'');
  if(!uuid.test(id))return;
  event.waitUntil(self.registration.getNotifications({tag:'uorqui-dm-'+id})
    .then(notifications=>notifications.forEach(notification=>notification.close())).catch(()=>{}));
});
