import { useEffect, useState } from 'react';

/** Count unread individual messages across all direct conversations. */
export function useUnreadDirectMessages() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let mounted = true;
    let requestId = 0;
    const acknowledging = new Set<string>();
    const acknowledged = new Set<string>();

    // Once the incoming message contributes to the global unread badge,
    // the recipient's connected client has received it. This acknowledgement
    // never calls /read and must not clear the unread notification.
    async function acknowledgeDelivery(conversationId: string, revision: string) {
      const key = conversationId + ':' + revision;
      if (!mounted || acknowledging.has(conversationId) || acknowledged.has(key)) return;
      acknowledging.add(conversationId);
      try {
        const response = await fetch('/api/v1/dm/conversations/' + encodeURIComponent(conversationId) + '/received', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
        });
        if (response.ok) acknowledged.add(key);
      } catch { /* Retry on the next visible inbox/badge refresh. */ }
      finally { acknowledging.delete(conversationId); }
    }

    async function refresh() {
      if (document.visibilityState === 'hidden') return;
      const id = ++requestId;
      try {
        const response = await fetch('/api/v1/dm/conversations', {
          credentials: 'same-origin', cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = await response.json() as {
          conversations?: { id: string; unreadCount: number; archived?: boolean; pendingReceivedAt?: string | null }[];
        };
        if (mounted && id === requestId && Array.isArray(payload.conversations)) {
          const count = payload.conversations.reduce((sum, thread) =>
            sum + (thread.archived ? 0 : Math.max(0, Number(thread.unreadCount) || 0)), 0);
          setUnread(count);
          // A successful fetch which actually feeds the badge is the delivery
          // milestone — independent of whether the conversation panel is open.
          for (const thread of payload.conversations) {
            if (!thread.archived && Number(thread.unreadCount) > 0 && thread.pendingReceivedAt) {
              void acknowledgeDelivery(thread.id, thread.pendingReceivedAt);
            }
          }
        }
      } catch { /* Keep the last known unread count during network failures. */ }
    }

    const localUpdate = (event: Event) => {
      const count = (event as CustomEvent<number>).detail;
      if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
        requestId++; // A local read refresh is newer than any pending fetch.
        setUnread(count);
      }
    };
    const onFocus = () => void refresh();
    window.addEventListener('uorqui:dm-unread-count', localUpdate);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const interval = window.setInterval(() => void refresh(), 25000);

    let source: EventSource | null = null;
    function connect() {
      if (document.visibilityState !== 'visible' || source) return;
      source = new EventSource('/api/v1/dm/events', { withCredentials: true });
      source.addEventListener('dm-update', onFocus);
      source.addEventListener('ready', onFocus);
    }
    function visibility() {
      if (document.visibilityState !== 'visible') {
        source?.close();
        source = null;
      } else {
        connect();
        void refresh();
      }
    }
    document.addEventListener('visibilitychange', visibility);
    connect();
    void refresh();

    return () => {
      mounted = false;
      requestId++;
      source?.close();
      window.clearInterval(interval);
      window.removeEventListener('uorqui:dm-unread-count', localUpdate);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  return unread;
}
