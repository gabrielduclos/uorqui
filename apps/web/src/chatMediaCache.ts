import { useEffect, useSyncExternalStore } from 'react';

/**
 * Private DM media: bounded tab-memory cache only. No Cache Storage, SW,
 * IndexedDB, localStorage, public CDN, or persistent authorization bypass.
 * The first fetch always passes the Worker's per-message membership check.
 */
const PRIVATE_DM_URL = /^\/media\/dm\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;
const LIMIT_BYTES = 90 * 1024 * 1024;
const MAX_ITEM_BYTES = 50 * 1024 * 1024;
const MAX_ITEMS = 36;
const MAX_AGE_MS = 10 * 60 * 1000;
const RETRY_MS = 12_000;

type Item = {
  blobUrl: string | null;
  size: number;
  accessedAt: number;
  checkedAt: number;
  failedAt: number;
  pending: Promise<string | null> | null;
  abort: AbortController | null;
};
const entries = new Map<string, Item>();
const listeners = new Set<() => void>();
const notify = () => { for (const fn of listeners) fn(); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = (src: string | null | undefined) => src && PRIVATE_DM_URL.test(src) ? entries.get(src)?.blobUrl ?? null : src ?? null;

function remove(url: string) {
  const item=entries.get(url);
  if(!item)return;
  entries.delete(url);
  item.abort?.abort();
  if(item.blobUrl)URL.revokeObjectURL(item.blobUrl);
}
export function clearChatMediaCache() {
  for(const key of [...entries.keys()])remove(key);
  notify();
}
export function invalidateChatMedia(url: string | null | undefined) {
  if(url && entries.has(url)){remove(url);notify();}
}
function prune() {
  const now=Date.now();
  for(const [url,item] of entries){
    if(!item.pending && (item.failedAt && now-item.failedAt>RETRY_MS*3 ||
      item.checkedAt && now-item.checkedAt>MAX_AGE_MS))remove(url);
  }
  let total=[...entries.values()].reduce((s,v)=>s+v.size,0);
  const lru=[...entries.entries()].filter(([,v])=>!v.pending)
    .sort((a,b)=>a[1].accessedAt-b[1].accessedAt);
  for(const [url,item] of lru) {
    if(total<=LIMIT_BYTES && entries.size<=MAX_ITEMS)break;
    total-=item.size;
    remove(url);
  }
}
export async function ensureChatMediaCached(url: string): Promise<string | null> {
  if(!PRIVATE_DM_URL.test(url))return url;
  if(typeof document!=='undefined' && document.visibilityState==='hidden')return null;
  prune();
  const existing=entries.get(url);
  if(existing?.blobUrl){existing.accessedAt=Date.now();return existing.blobUrl;}
  if(existing?.pending)return existing.pending;
  if(existing?.failedAt && Date.now()-existing.failedAt<RETRY_MS)return null;
  const abort=new AbortController();
  const item:Item=existing??{blobUrl:null,size:0,accessedAt:Date.now(),checkedAt:0,failedAt:0,pending:null,abort:null};
  item.abort=abort;
  entries.set(url,item);
  const task=(async()=>{
    try {
      const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:abort.signal});
      if(!response.ok)throw Error('Not authorized to access DM media');
      const kind=(response.headers.get('content-type')??'').split(';')[0].toLowerCase();
      if(!/^(image|audio|video)\//.test(kind))throw Error('Unexpected media content');
      const length=Number(response.headers.get('content-length')??0);
      if(length>MAX_ITEM_BYTES)throw Error('Media exceeds memory cache limit');
      const blob=await response.blob();
      if(blob.size>MAX_ITEM_BYTES)throw Error('Media exceeds memory cache limit');
      if(entries.get(url)!==item || abort.signal.aborted)return null;
      item.blobUrl=URL.createObjectURL(blob);
      item.size=blob.size;
      item.checkedAt=Date.now();
      item.failedAt=0;
      return item.blobUrl;
    }catch{
      if(entries.get(url)===item && !abort.signal.aborted)item.failedAt=Date.now();
      return null;
    }finally{
      if(entries.get(url)===item){
        item.pending=null;
        item.abort=null;
        item.accessedAt=Date.now();
        notify();
        prune();
      }
    }
  })();
  item.pending=task;
  return task;
}

/** Keep one stable object URL across the bubble and expanded viewer. */
export function useCachedChatMedia(src: string | null | undefined, eager = true) {
  const cached=useSyncExternalStore(subscribe,()=>snapshot(src),()=>null);
  useEffect(()=>{if(eager && src && PRIVATE_DM_URL.test(src))void ensureChatMediaCached(src);},[src,eager]);
  return cached;
}
