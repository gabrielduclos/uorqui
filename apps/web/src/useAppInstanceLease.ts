import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeDmStream } from './dmEventStream';
import { acquireDocumentLock, anotherDocumentPresent, persistentInstanceId } from './appInstanceIdentity';

export type AppInstanceStatus = 'checking' | 'active' | 'blocked' | 'error';
type InstanceKind = 'desktop' | 'mobile';
type Ownership = { accountId: string | null; status: AppInstanceStatus };
type ClaimResponse = { active?: boolean; managed?: boolean; error?: string };
type ChannelNotice = { type?: string; accountId?: string; kind?: string; instanceId?: string;
  pageId?: string; probeId?: string; replyTo?: string };
const CHANNEL = 'uorqui:active-app-instance:v1';
const PERIOD_MS = 15_000;
const LOCK_RETRY_MS = 250;

function deviceCategory(): InstanceKind {
  const agent = navigator.userAgent;
  // A standalone iOS/Android PWA remains mobile regardless of viewport size.
  return /Android|iPhone|iPad|iPod|Mobile/i.test(agent) ||
    (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1) ? 'mobile' : 'desktop';
}

/** Separate two identities:
 * - instanceId: persisted for the same browser/PWA installation and account;
 * - pageId: unique to each live document (including a duplicated browser tab).
 * Web Locks ensure only one page at a time may use the persistent identity.
 * The existing PostgreSQL lease still isolates different browsers/devices.
 */
export function useAppInstanceLease(accountId: string | null) {
  const kind = useMemo(deviceCategory, []);
  const pageId = useRef(crypto.randomUUID()).current;
  const instanceId = useMemo(() => {
    if (!accountId) return null;
    try { return persistentInstanceId(window.localStorage, accountId, kind); }
    catch { return crypto.randomUUID(); }
  }, [accountId, kind]);
  const [ownership, setOwnership] = useState<Ownership>({ accountId, status: 'checking' });
  const retryRef = useRef<(takeover: boolean) => void>(()=>{});
  const ownedRef = useRef(false);
  const status = ownership.accountId === accountId ? ownership.status : 'checking';

  useEffect(() => {
    if (!accountId || !instanceId) return;
    let alive = true;
    let sequence = 0;
    let failures = 0;
    let requestInProgress = false;
    let wasPageHidden = false;
    let current: AppInstanceStatus = 'checking';
    let releaseLocal: (() => void) | null = null;
    const lockName = 'uorqui:instance-lock:v2:' + accountId + ':' + kind;
    const hasLocks = typeof navigator.locks?.request === 'function';
    const set = (next: AppInstanceStatus) => {
      current = next;
      ownedRef.current = next === 'active';
      if (alive) setOwnership({ accountId, status: next });
    };
    const dropLocal = () => {
      releaseLocal?.();
      releaseLocal = null;
    };
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);

    const claim = async (takeover: boolean) => {
      if (!alive || (requestInProgress && !takeover)) return;
      requestInProgress = true;
      const version = ++sequence;
      if (current !== 'active') set('checking');
      try {
      // A browser-level identity MUST only be shared by one live document.
      // Browser Web Locks are atomic across same-origin pages and PWAs.
      if (!releaseLocal && hasLocks) {
        let release = await acquireDocumentLock(navigator.locks, lockName, takeover);
        // On a reload, the previous document can still be unwinding its lock.
        // Wait briefly once before reporting a genuine second tab.
        if (!release && !takeover) {
          await new Promise(resolve => window.setTimeout(resolve, LOCK_RETRY_MS));
          if (!alive || version !== sequence) return;
          release = await acquireDocumentLock(navigator.locks, lockName, false);
        }
        if (!alive || version !== sequence) { release?.(); return; }
        if (!release) { failures = 0; set('blocked'); return; }
        releaseLocal = release;
      } else if (!hasLocks && current !== 'active' && !takeover && channel) {
        // Older browsers: avoid auto-resuming over an already live sibling tab.
        if (await anotherDocumentPresent(channel, accountId, kind, pageId)) {
          if (alive && version === sequence) { failures = 0; set('blocked'); }
          return;
        }
      }
      if (!alive || version !== sequence) return;
      try {
        const response = await fetch('/api/v1/instances/claim', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, instanceId, takeover }),
        });
        const data = await response.json().catch(()=>({})) as ClaimResponse;
        if (!alive || version !== sequence) return;
        if (response.status === 409 && data.error === 'INSTANCE_IN_USE') {
          failures = 0;
          dropLocal();
          set('blocked');
          return;
        }
        if (!response.ok || data.active !== true) throw Error('INSTANCE_UNAVAILABLE');
        failures = 0;
        const wasActive = current === 'active';
        set('active');
        // pageId (not instanceId) identifies the winning document; same-
        // browser tabs intentionally share a stable instanceId.
        if (!wasActive || takeover) channel?.postMessage({ type: 'claimed', accountId, kind, instanceId, pageId });
      } catch {
        if (!alive || version !== sequence) return;
        if (current === 'active' && ++failures < 2) return;
        dropLocal();
        set('error');
      }
      } finally {
        if (version === sequence) requestInProgress = false;
      }
    };

    retryRef.current = (takeover: boolean) => { void claim(takeover); };
    channel?.addEventListener('message', event => {
      const data = event.data as ChannelNotice | null;
      if (!data || data.accountId !== accountId || data.kind !== kind || data.pageId === pageId) return;
      if (data.type === 'probe') {
        if (current === 'active') channel.postMessage({
          type: 'present', accountId, kind, instanceId, pageId, replyTo: data.probeId,
        });
        return;
      }
      if (data.type !== 'claimed') return;
      // A different document in this browser now owns the category. Stop all
      // workspace/SSE/media activity without touching its shared login cookie.
      ++sequence;
      requestInProgress = false;
      failures = 0;
      dropLocal();
      set('blocked');
    });
    const tick = () => {
      if (current === 'active') void claim(false);
    };
    const restore = () => {
      if (document.visibilityState === 'visible' && (current === 'active' || current === 'error'))
        void claim(false);
    };
    const pageShow = () => {
      // Do not make an extra startup claim from pageshow/focus while the
      // initial claim is already pending. Only restore a real BFCache page.
      if (wasPageHidden) { wasPageHidden = false; void claim(false); }
    };
    const online = () => { if (current === 'error') void claim(false); };
    const pageHide = () => {
      wasPageHidden = true;
      ++sequence;
      requestInProgress = false;
      dropLocal();
      // Do NOT release the server lease here: the same browser/PWA may be
      // reopened instantly and should reuse its identity without a 60s wait.
      // Releasing on pagehide races with a new document's claim.
      set('checking');
    };
    const interval = window.setInterval(tick, PERIOD_MS);
    window.addEventListener('focus', restore);
    window.addEventListener('pageshow', pageShow);
    window.addEventListener('pagehide', pageHide);
    document.addEventListener('visibilitychange', restore);
    window.addEventListener('online', online);
    void claim(false);
    return () => {
      alive = false;
      ++sequence;
      ownedRef.current = false;
      dropLocal();
      channel?.close();
      window.clearInterval(interval);
      window.removeEventListener('focus', restore);
      window.removeEventListener('pageshow', pageShow);
      window.removeEventListener('pagehide', pageHide);
      document.removeEventListener('visibilitychange', restore);
      window.removeEventListener('online', online);
      retryRef.current = () => {};
    };
  }, [accountId, instanceId, pageId, kind]);

  // Reuse the authenticated message SSE; explicit cross-browser takeovers
  // trigger an immediate recheck, with 15-second polling as fallback.
  useEffect(() => {
    if (!accountId || status !== 'active') return;
    return subscribeDmStream(event => {
      if (event.kind === 'instance-lease') retryRef.current(false);
    });
  }, [accountId, status]);

  const release = useCallback(async () => {
    // A blocked tab shares its browser's identity, but must never delete the
    // active tab's lease when the user presses Sign out.
    if (!accountId || !instanceId || !ownedRef.current) return;
    ownedRef.current = false;
    try {
      await fetch('/api/v1/instances/release', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, instanceId }),
      });
    } catch { /* An abandoned lease expires after 60 seconds. */ }
  }, [accountId, kind, instanceId]);

  return { kind, status, takeover: () => retryRef.current(true), retry: () => retryRef.current(false), release };
}
