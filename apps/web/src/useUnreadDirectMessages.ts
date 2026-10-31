import { useEffect, useState } from 'react';

/** Count unread individual messages across all direct conversations. */
export function useUnreadDirectMessages() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let mounted = true;
    let requestId = 0;

    async function refresh() {
      if (document.visibilityState === 'hidden') return;
      const id = ++requestId;
      try {
        const response = await fetch('/api/v1/dm/conversations', {
          credentials: 'same-origin', cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = await response.json() as {
          conversations?: { unreadCount: number }[];
        };
        if (mounted && id === requestId && Array.isArray(payload.conversations)) {
          setUnread(payload.conversations.reduce((sum, thread) =>
            sum + Math.max(0, Number(thread.unreadCount) || 0), 0));
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
