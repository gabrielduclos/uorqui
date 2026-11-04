import { useEffect, useSyncExternalStore } from 'react';

/**
 * Reuse immutable, authorized private R2 profile images across app restarts.
 * A bounded IndexedDB copy is scoped to the authenticated account and never
 * placed in shared HTTP, Service Worker, CDN or Cache Storage caches.
 * The app only mounts authenticated profile UI after /api/v1/me succeeds.
 * URLs change when a picture is replaced; logout and privacy changes purge data.
 */
const PROFILE_MEDIA = /^\/media\/profile\/[a-f0-9-]{36}\/(?:avatar|cover)\/[a-f0-9-]{36}\.(?:webp|png|jpg)$/;
const MAX_ENTRIES = 48;
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_DISK_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DISK_BYTES = 24 * 1024 * 1024;
const MAX_DISK_ENTRIES = 64;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const RETRY_FAILED_MS = 12_000;
const DB_NAME = 'uorqui-profile-image-cache';
const DB_TABLE = 'images';

type Cached = {
  blobUrl: string | null;
  pending: Promise<void> | null;
  checkedAt: number;
  accessedAt: number;
  failedAt: number;
};
type StoredImage = {
  key: string;
  accountId: string;
  url: string;
  blob: Blob;
  checkedAt: number;
};

const entries = new Map<string, Cached>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const persistKey = (accountId: string, url: string) => accountId + ':' + url;
let activeAccount: string | null = null;
let generation = 0;
let databasePromise: Promise<IDBDatabase | null> | null = null;
let purgePending: Promise<void> = Promise.resolve();

function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise(resolve => {
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DB_NAME, 1); }
    catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_TABLE))
        request.result.createObjectStore(DB_TABLE, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = null; };
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
}
async function getStored(accountId: string, url: string): Promise<StoredImage | null> {
  const db = await database();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const request = db.transaction(DB_TABLE, 'readonly').objectStore(DB_TABLE).get(persistKey(accountId,url));
      request.onsuccess = () => resolve((request.result as StoredImage | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function removeStored(accountId: string, url: string) {
  const db = await database();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(DB_TABLE, 'readwrite');
      tx.objectStore(DB_TABLE).delete(persistKey(accountId,url));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}
async function eraseStored() {
  const db = await database();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(DB_TABLE, 'readwrite');
      tx.objectStore(DB_TABLE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}
async function putStored(accountId: string, url: string, blob: Blob, checkedAt: number) {
  await purgePending;
  if (accountId !== activeAccount) return;
  const db = await database();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(DB_TABLE, 'readwrite');
      tx.objectStore(DB_TABLE).put({ key: persistKey(accountId,url), accountId, url, blob, checkedAt } satisfies StoredImage);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}
async function trimStored() {
  const db = await database();
  if (!db) return;
  const all = await new Promise<StoredImage[]>(resolve => {
    try {
      const request = db.transaction(DB_TABLE, 'readonly').objectStore(DB_TABLE).getAll();
      request.onsuccess = () => resolve(request.result as StoredImage[]);
      request.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
  const now = Date.now();
  const sorted = [...all].sort((a,b) => b.checkedAt-a.checkedAt);
  let size = 0, count = 0;
  const remove: StoredImage[] = [];
  for (const item of sorted) {
    const valid = item.accountId === activeAccount && PROFILE_MEDIA.test(item.url) &&
      item.blob instanceof Blob && item.blob.size <= MAX_IMAGE_BYTES &&
      item.blob.type.startsWith('image/') &&
      now - item.checkedAt >= 0 && now - item.checkedAt < MAX_DISK_AGE_MS;
    if (!valid || count >= MAX_DISK_ENTRIES || size+item.blob.size > MAX_DISK_BYTES) {
      remove.push(item);
    } else { count++; size += item.blob.size; }
  }
  for (const item of remove) await removeStored(item.accountId,item.url);
}
function schedulePurge() {
  purgePending = purgePending.catch(()=>{}).then(eraseStored);
  return purgePending;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function cachedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!PROFILE_MEDIA.test(url)) return url;
  return entries.get(url)?.blobUrl ?? null;
}
function evict(url: string) {
  const old = entries.get(url);
  if (!old) return;
  entries.delete(url);
  if (old.blobUrl) URL.revokeObjectURL(old.blobUrl);
}

/** Register the authenticated account before rendering its profile images. */
export function setProfileImageCacheAccount(accountId: string | null) {
  if (activeAccount === accountId) return;
  const previous = activeAccount;
  generation++;
  activeAccount = accountId;
  for (const url of [...entries.keys()]) evict(url);
  emit();
  // Never retain private image bytes belonging to a different account.
  if (previous && previous !== accountId) void schedulePurge();
}

/** Purge all private profile images on logout and access/visibility changes. */
export function clearProfileImageCache(): Promise<void> {
  generation++;
  for (const url of [...entries.keys()]) evict(url);
  emit();
  return schedulePurge();
}
/** Called when an avatar or cover is replaced or removed. */
export function invalidateProfileImage(url: string | null | undefined) {
  if (!url) return;
  generation++;
  evict(url);
  emit();
  if (activeAccount) void removeStored(activeAccount,url);
}
function removeOldEntries(now: number) {
  let changed = false;
  for (const [url,item] of [...entries]) {
    if (!item.pending && now-item.accessedAt >= MAX_AGE_MS) {
      evict(url); changed = true;
    }
  }
  if (entries.size > MAX_ENTRIES) {
    const lru = [...entries.entries()].filter(([,item])=>!item.pending)
      .sort((a,b)=>a[1].accessedAt-b[1].accessedAt);
    for (const [url] of lru.slice(0,Math.max(0,entries.size-MAX_ENTRIES))) {
      evict(url); changed = true;
    }
  }
  if (changed) emit();
}
function load(url: string) {
  if (!PROFILE_MEDIA.test(url)) return;
  const now = Date.now();
  removeOldEntries(now);
  const existing = entries.get(url);
  if (existing?.pending) return;
  if (existing?.blobUrl) { existing.accessedAt = now; return; }
  if (existing?.failedAt && now-existing.failedAt < RETRY_FAILED_MS) return;
  const item: Cached = existing ?? { blobUrl: null, pending: null, checkedAt: now, accessedAt: now, failedAt: 0 };
  const account = activeAccount;
  const startedAt = generation;
  const stillValid = () => entries.get(url) === item && generation === startedAt && account === activeAccount;
  entries.set(url,item);
  const task = (async () => {
    await purgePending;
    if (!stillValid()) return;
    if (account) {
      const restored = await getStored(account,url);
      if (!stillValid()) return;
      if (restored && restored.accountId===account && restored.url===url &&
        restored.blob instanceof Blob && restored.blob.type.startsWith('image/') &&
        restored.blob.size<=MAX_IMAGE_BYTES && Date.now()-restored.checkedAt<MAX_DISK_AGE_MS &&
        Date.now()-restored.checkedAt>=0) {
        item.blobUrl = URL.createObjectURL(restored.blob);
        item.checkedAt = Date.now();
        item.failedAt = 0;
        return;
      }
      if (restored) void removeStored(account,url);
    }
    const response = await fetch(url,{credentials:'same-origin',cache:'no-store'});
    if (!response.ok) throw Error('Profile image inaccessible');
    const contentType = (response.headers.get('content-type')??'').split(';')[0].toLowerCase();
    if (!contentType.startsWith('image/')) throw Error('Invalid profile image type');
    const blob = await response.blob();
    if (blob.size>MAX_IMAGE_BYTES) throw Error('Profile image too large');
    if (!stillValid()) return;
    item.blobUrl=URL.createObjectURL(blob);
    item.checkedAt=Date.now();
    item.failedAt=0;
    if (account) {
      void putStored(account,url,blob,item.checkedAt).then(trimStored).catch(()=>{});
    }
  })().catch(() => {
    if (stillValid()) item.failedAt=Date.now();
  }).finally(() => {
    if (stillValid()) {
      item.pending=null;
      item.accessedAt=Date.now();
      emit();
      removeOldEntries(Date.now());
    }
  });
  item.pending=task;
}

/** One Blob URL shared by the profile, header and conversation list. */
export function useCachedProfileImage(url: string | null | undefined): string | null {
  const src=useSyncExternalStore(subscribe,()=>cachedUrl(url),()=>null);
  useEffect(()=>{if(url)load(url);},[url]);
  return src;
}
