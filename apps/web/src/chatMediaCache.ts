import { useEffect, useSyncExternalStore } from 'react';

/**
 * Private DM and community media: bounded, account-scoped tab-memory cache only.
 * No Cache Storage, SW, IndexedDB, localStorage, public CDN or persistent bytes.
 * Every HTTP fetch passes the Worker's per-message authorization checks; cache
 * entries are revoked on logout, account switches and message deletion.
 */
const PRIVATE_MEDIA_URL = /^(?:\/media\/dm\/[0-9a-f-]{36}\/[0-9a-f-]{36}|\/media\/community-attachment\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36})$/i;
// Allow more reusable private media on devices with sufficient RAM, without
// making mobile/PWA tabs hold an unbounded collection of large videos.
const deviceMemory=typeof navigator==='undefined'?4:(navigator as Navigator & { deviceMemory?:number }).deviceMemory??4;
const LIMIT_BYTES = deviceMemory<=2?32*1024*1024:deviceMemory<=4?64*1024*1024:96*1024*1024;
const MAX_ITEM_BYTES = 24 * 1024 * 1024;
const MAX_ITEMS = 42;
const MAX_AGE_MS = 90 * 60 * 1000;
const RETRY_MS = 12_000;
const MAX_PARALLEL_MEDIA = 3;
let downloading = 0;
const downloadQueue: Array<() => void> = [];
async function withMediaSlot<T>(task: () => Promise<T>): Promise<T> {
  if (downloading >= MAX_PARALLEL_MEDIA) await new Promise<void>(resolve => downloadQueue.push(resolve));
  downloading++;
  try { return await task(); }
  finally { downloading--; downloadQueue.shift()?.(); }
}

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
// Private bytes are never persisted. Switching accounts revokes every Blob URL
// and aborts ongoing transfers before the new account can render messages.
let activeAccountId: string | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const fn of listeners) fn(); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = (src: string | null | undefined) => {
  if (!src || !PRIVATE_MEDIA_URL.test(src)) return src ?? null;
  const item = entries.get(src);
  // Unsupported or oversized media must still load via the authorized URL.
  return item?.blobUrl ?? (item?.failedAt ? src : null);
};

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
/** Bind the RAM-only media cache to the authenticated account. */
export function setChatMediaCacheAccount(accountId: string | null) {
  if(activeAccountId === accountId)return;
  activeAccountId=accountId;
  clearChatMediaCache();
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
  let changed=false;
  for(const [url,item] of lru){
    if(total<=LIMIT_BYTES && entries.size<=MAX_ITEMS)break;
    total-=item.size;
    remove(url);
    changed=true;
  }
  if(changed)notify();
}

export async function ensureChatMediaCached(url: string): Promise<string | null> {
  if(!PRIVATE_MEDIA_URL.test(url))return url;
  // A valid app session must exist before a private blob is retained in RAM.
  if(!activeAccountId)return null;
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
      const blob=await withMediaSlot(async () => {
        if (abort.signal.aborted) throw Error('Media request canceled');
        const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:abort.signal});
        if(!response.ok)throw Error('Not authorized to access DM media');
        const kind=(response.headers.get('content-type')??'').split(';')[0].toLowerCase();
        if(!(/^(image|audio|video)\//.test(kind)||/^(application\/(?:pdf|zip|octet-stream|msword|vnd\.(?:openxmlformats-officedocument|ms-excel|ms-powerpoint))|text\/plain)$/.test(kind)))
          throw Error('Unexpected media content');
        if(response.status===206)throw Error('Partial response must not be cached as complete');
        const length=Number(response.headers.get('content-length')??0);
        if(length>MAX_ITEM_BYTES)throw Error('Media exceeds memory cache limit');
        // Cap the stream while reading, even if the server sends no length.
        // Do not download a complete 50 MB video just to discard it afterwards.
        if(!response.body){
          const bytes=await response.blob();
          if(bytes.size>MAX_ITEM_BYTES)throw Error('Media exceeds memory cache limit');
          return bytes;
        }
        const reader=response.body.getReader();
        const chunks:BlobPart[]=[];
        let total=0;
        try{
          while(true){
            const {done,value}=await reader.read();
            if(done)break;
            total+=value.byteLength;
            if(total>MAX_ITEM_BYTES){
              await reader.cancel().catch(()=>{});
              throw Error('Media exceeds memory cache limit');
            }
            const copy=new Uint8Array(value.byteLength);
            copy.set(value);
            chunks.push(copy);
          }
        }finally{reader.releaseLock();}
        return new Blob(chunks,{type:kind});
      });
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
  useEffect(()=>{if(eager && src && PRIVATE_MEDIA_URL.test(src))void ensureChatMediaCached(src);},[src,eager]);
  return cached;
}

