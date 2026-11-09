import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeDmStream } from './dmEventStream';

export type AppInstanceStatus = 'checking' | 'active' | 'blocked' | 'error';
type InstanceKind = 'desktop' | 'mobile';
type Ownership = { accountId: string | null; status: AppInstanceStatus };
type ClaimResponse = { active?: boolean; managed?: boolean; error?: string };
const CHANNEL = 'uorqui:active-app-instance:v1';
const PERIOD_MS = 15_000;

function deviceCategory(): InstanceKind {
  const agent = navigator.userAgent;
  // An installed iOS/Android PWA is still mobile even with a desktop-width
  // viewport. iPadOS may report a Macintosh UA; touch identifies that case.
  return /Android|iPhone|iPad|iPod|Mobile/i.test(agent) ||
    (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1) ? 'mobile' : 'desktop';
}

/** A new document gets a fresh ID, even when the browser duplicates a tab
 * together with sessionStorage. Reloading claims the same category again
 * without changing the user's authenticated Better Auth session.
 */
export function useAppInstanceLease(accountId: string | null) {
  const kind = useMemo(deviceCategory, []);
  const instanceId = useRef(crypto.randomUUID()).current;
  const [ownership, setOwnership] = useState<Ownership>({ accountId, status: 'checking' });
  const retryRef = useRef<(takeover: boolean) => void>(()=>{});
  const status = ownership.accountId === accountId ? ownership.status : 'checking';

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    let sequence = 0;
    let failures = 0;
    let current: AppInstanceStatus = 'checking';
    const set = (next: AppInstanceStatus) => {
      current = next;
      if (alive) setOwnership({ accountId, status: next });
    };
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
    const claim = async (takeover: boolean) => {
      if (!alive) return;
      const version = ++sequence;
      if (current !== 'active') set('checking');
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
          set('blocked');
          return;
        }
        if (!response.ok || data.active !== true) throw Error('INSTANCE_UNAVAILABLE');
        failures = 0;
        const wasActive = current === 'active';
        set('active');
        if (!wasActive || takeover) channel?.postMessage({ type: 'claimed', accountId, kind, instanceId });
      } catch {
        if (!alive || version !== sequence) return;
        if (current === 'active' && ++failures < 2) return;
        set('error');
      }
    };
    retryRef.current = (takeover: boolean) => { void claim(takeover); };
    channel?.addEventListener('message', event => {
      const data = event.data as { type?: string; accountId?: string; kind?: string; instanceId?: string } | null;
      if (data?.type !== 'claimed' || data.accountId !== accountId || data.kind !== kind ||
          data.instanceId === instanceId) return;
      // A newer tab acquired the slot, so destroy the old workspace and
      // close its SSE and media connections instead of logging out.
      ++sequence;
      failures = 0;
      set('blocked');
    });
    const tick = () => {
      if (current === 'active') void claim(false);
    };
    const restore = () => {
      if (document.visibilityState === 'visible' && (current === 'active' || current === 'error'))
        void claim(false);
    };
    const online = () => {
      if (current === 'error') void claim(false);
    };
    const interval = window.setInterval(tick, PERIOD_MS);
    window.addEventListener('focus', restore);
    document.addEventListener('visibilitychange', restore);
    window.addEventListener('online', online);
    void claim(false);
    return () => {
      alive = false;
      ++sequence;
      channel?.close();
      window.clearInterval(interval);
      window.removeEventListener('focus', restore);
      document.removeEventListener('visibilitychange', restore);
      window.removeEventListener('online', online);
      retryRef.current = () => {};
    };
  }, [accountId, instanceId, kind]);

  // Reuse the existing per-account SSE socket; an explicit takeover alerts
  // the displaced browser without a new connection. Polling is the fallback.
  useEffect(() => {
    if (!accountId || status !== 'active') return;
    return subscribeDmStream(event => {
      if (event.kind === 'instance-lease') retryRef.current(false);
    });
  }, [accountId, status]);

  const release = useCallback(async () => {
    if (!accountId) return;
    try {
      await fetch('/api/v1/instances/release', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, instanceId }),
      });
    } catch { /* A 60-second lease expires even if the network is unavailable. */ }
  }, [accountId, kind, instanceId]);

  return { kind, status, takeover: () => retryRef.current(true), retry: () => retryRef.current(false), release };
}
