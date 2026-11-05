import { useEffect, useState } from 'react';
import { dmStreamConnected, invalidateDmInbox, loadDmInboxNetwork, subscribeDmStream } from './dmEventStream';
import { peekDmInbox, readDmInbox } from './dmCache';
import {clearReadPush} from './readPushNotifications';

/** One source of unread truth; shares the messenger's network and SSE transport. */
export function useUnreadDirectMessages(accountId: string) {
  const [unread, setUnread] = useState(() => peekDmInbox<{unreadCount:number;archived:boolean}>(accountId)
    .reduce((sum, thread) => sum + (thread.archived ? 0 : Math.max(0, Number(thread.unreadCount) || 0)), 0));
  useEffect(() => {
    let mounted = true;
    let sequence = 0;
    let lastRefresh = Date.now();
    let receivedFromServer = false;
    const acknowledging = new Set<string>();
    const acknowledged = new Set<string>();
    type Thread = { id: string; unreadCount: number; archived?: boolean; pendingReceivedAt?: string | null };
    async function acknowledgeDelivery(conversationId: string, revision: string) {
      const key = conversationId + ':' + revision;
      if (!mounted || acknowledging.has(conversationId) || acknowledged.has(key)) return;
      acknowledging.add(conversationId);
      try {
        const response = await fetch('/api/v1/dm/conversations/' + encodeURIComponent(conversationId) + '/received', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
        });
        if (response.ok) acknowledged.add(key);
      } catch { /* retry during next reconciliation */ }
      finally { acknowledging.delete(conversationId); }
    }
    async function refresh() {
      if (document.visibilityState === 'hidden') return;
      const id = ++sequence;
      try {
        const payload = await loadDmInboxNetwork<Thread>(accountId);
        if (!mounted || id !== sequence) return;
        const count = payload.conversations.reduce((sum, thread) =>
          sum + (thread.archived ? 0 : Math.max(0, Number(thread.unreadCount) || 0)), 0);
        setUnread(count);
        // Sync already-read conversations even when the user is in another module.
        const readConversations=payload.conversations.filter(thread=>
          thread.unreadCount===0&&/^[0-9a-f-]{36}$/i.test(thread.id)).slice(0,100);
        if(readConversations.length)clearReadPush(readConversations.map(thread=>({kind:'dm' as const,conversationId:thread.id})));
        receivedFromServer = true;
        lastRefresh = Date.now();
        for (const thread of payload.conversations) {
          if (!thread.archived && thread.unreadCount > 0 && thread.pendingReceivedAt)
            void acknowledgeDelivery(thread.id, thread.pendingReceivedAt);
        }
      } catch { /* keep last valid badge */ }
    }
    void readDmInbox<Thread>(accountId).then(cached => {
      if (mounted && !receivedFromServer && cached.length) setUnread(cached.reduce((sum, thread) =>
        sum + (thread.archived ? 0 : Math.max(0, Number(thread.unreadCount) || 0)), 0));
    });
    const local = (event: Event) => {
      const count = (event as CustomEvent<number>).detail;
      if (typeof count === 'number' && Number.isFinite(count) && count >= 0) setUnread(count);
    };
    const onFocus = () => { invalidateDmInbox(); void refresh(); };
    window.addEventListener('uorqui:dm-unread-count', local);
    window.addEventListener('focus', onFocus);
    const unsubscribe = subscribeDmStream(event => {
      if (event.kind === 'notification') window.dispatchEvent(new Event('uorqui:activity-update'));
      if (event.kind === 'notification') return;
      invalidateDmInbox();
      void refresh();
    });
    const onVisibility = () => { if (document.visibilityState === 'visible') onFocus(); };
    document.addEventListener('visibilitychange', onVisibility);
    // Healthy SSE requires no periodic inbox download; the fallback covers broken streams.
    const interval = window.setInterval(() => {
      if (!dmStreamConnected() || Date.now() - lastRefresh >= 120_000) onFocus();
    }, 15000);
    void refresh();
    return () => {
      mounted = false; sequence++;
      unsubscribe(); window.clearInterval(interval);
      window.removeEventListener('uorqui:dm-unread-count', local);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [accountId]);
  return unread;
}
