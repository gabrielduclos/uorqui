import { useEffect, useSyncExternalStore } from 'react';

/**
 * Private R2 media cannot use a public CDN or persistent browser cache: every
 * network read still goes through the Worker authorization endpoint.
 *
 * Keep successful image responses in a bounded, tab-local blob URL cache to
 * avoid fetching the same avatar/cover when switching screens. This cache is
 * never written to localStorage, IndexedDB, service workers or Cache Storage.
 */
const PROFILE_MEDIA = /^\/media\/profile\/[a-f0-9-]{36}\/(?:avatar|cover)\/[a-f0-9-]{36}\.(?:webp|png|jpg)$/;
const MAX_ENTRIES = 48;
const MAX_AGE_MS = 5 * 60 * 1000;
const RETRY_FAILED_MS = 12_000;

type Cached = {
  blobUrl: string | null;
  pending: Promise<void> | null;
  checkedAt: number;
  accessedAt: number;
  failedAt: number;
};

const entries = new Map<string, Cached>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

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

/** Purge tab-local private images when account or visibility changes. */
export function clearProfileImageCache() {
  for (const url of entries.keys()) evict(url);
  emit();
}

/** Called when replacing a photo; the previous image must not remain visible. */
export function invalidateProfileImage(url: string | null | undefined) {
  if (url && entries.has(url)) {
    evict(url);
    emit();
  }
}

function removeOldEntries(now: number) {
  for (const [url, item] of entries) {
    if (!item.pending && now - item.checkedAt >= MAX_AGE_MS) evict(url);
  }
  if (entries.size > MAX_ENTRIES) {
    const lru = [...entries.entries()].filter(([,item]) => !item.pending).sort((a,b) => a[1].accessedAt - b[1].accessedAt);
    for (const [url] of lru.slice(0, entries.size - MAX_ENTRIES)) evict(url);
  }
}

function load(url: string) {
  if (!PROFILE_MEDIA.test(url)) return;
  const now = Date.now();
  removeOldEntries(now);
  const existing = entries.get(url);
  if (existing?.pending) return;
  if (existing?.blobUrl) { existing.accessedAt = now; return; }
  if (existing?.failedAt && now - existing.failedAt < RETRY_FAILED_MS) return;
  const value: Cached = existing ?? { blobUrl: null, pending: null, checkedAt: now, accessedAt: now, failedAt: 0 };
  const task = fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error('Image inaccessible');
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) throw new Error('Invalid image content');
    const blob = await response.blob();
    if (blob.size > 3 * 1024 * 1024) throw new Error('Image too large');
    if (entries.get(url) !== value) return; // revoked while request was in flight
    value.blobUrl = URL.createObjectURL(blob);
    value.checkedAt = Date.now();
    value.failedAt = 0;
  }).catch(() => {
    if (entries.get(url) === value) value.failedAt = Date.now();
  }).finally(() => {
    if (entries.get(url) === value) {
      value.pending = null;
      value.accessedAt = Date.now();
      emit();
      removeOldEntries(Date.now());
    }
  });
  value.pending = task;
  entries.set(url, value);
}

/**
 * Reuse the same decoded Blob URL across headers, lists and profile screens.
 * External URLs use ordinary img behavior; R2 assets are authorization-aware.
 */
export function useCachedProfileImage(url: string | null | undefined): string | null {
  const src = useSyncExternalStore(subscribe, () => cachedUrl(url), () => null);
  useEffect(() => { if (url) load(url); }, [url]);
  return src;
}
