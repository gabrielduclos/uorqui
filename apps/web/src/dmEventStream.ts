/** A single authenticated SSE connection shared by unread badges and DM screens. */
export type DmStreamEvent = {
  conversationId: string;
  kind: 'message' | 'read' | 'conversation' | 'update' | 'received' | 'friendship-update' | 'notification';
  message?: {
    id: string; conversationId: string; authorId: string; clientId: string | null;
    body: string; createdAt: string; readAt: string | null; deliveredAt: string | null;
    editedAt: string | null; deletedAt: string | null; forwarded: boolean;
    replyToId?: string | null;
    attachment?: { id: string; name: string; type: string; size: number } | null;
  };
};
type Listener = (event: DmStreamEvent | { kind: 'ready'; conversationId: '' }) => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;
let connected = false;
let active = false;
let connectionGeneration = 0;
const emit = (event: Parameters<Listener>[0]) => {
  for (const listener of listeners) try { listener(event); } catch { /* independent subscribers */ }
};
function disconnect() {
  connectionGeneration++;
  source?.close();
  source = null;
  connected = false;
}
function connect() {
  if (!active || document.visibilityState !== 'visible' || source || typeof EventSource === 'undefined') return;
  const generation = ++connectionGeneration;
  const stream = new EventSource('/api/v1/dm/events', { withCredentials: true });
  source = stream;
  stream.onopen = () => { if (generation === connectionGeneration) connected = true; };
  stream.onerror = () => { if (generation === connectionGeneration) connected = false; };
  stream.addEventListener('ready', () => {
    if (generation === connectionGeneration) emit({ kind: 'ready', conversationId: '' });
  });
  stream.addEventListener('dm-update', event => {
    if (generation !== connectionGeneration) return;
    try {
      const parsed: unknown = JSON.parse((event as MessageEvent<string>).data);
      if (!parsed || typeof parsed !== 'object') return;
      const item = parsed as DmStreamEvent;
      if (typeof item.conversationId !== 'string' || typeof item.kind !== 'string') return;
      emit(item);
    } catch { /* invalid event ignored */ }
  });
}
function visibility() {
  if (document.visibilityState === 'hidden') disconnect();
  else { connect(); emit({ kind: 'ready', conversationId: '' }); }
}
export function subscribeDmStream(listener: Listener): () => void {
  listeners.add(listener);
  if (!active && typeof document !== 'undefined') {
    active = true;
    document.addEventListener('visibilitychange', visibility);
    connect();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && active) {
      active = false;
      document.removeEventListener('visibilitychange', visibility);
      disconnect();
    }
  };
}
export function dmStreamConnected(): boolean {
  return connected && typeof document !== 'undefined' && document.visibilityState === 'visible';
}
/** Shared in-flight query prevents the sidebar, badge and event from requesting the same inbox twice. */
let inboxTask: Promise<{ conversations: unknown[] }> | null = null;
let inboxResult: { conversations: unknown[] } | null = null;
let inboxAt = 0;
let inboxAccount = '';
export function invalidateDmInbox(): void { inboxAt = 0; inboxResult = null; inboxTask = null; inboxAccount = ''; }
export async function loadDmInboxNetwork<T>(accountId: string): Promise<{ conversations: T[] }> {
  if (inboxAccount !== accountId) { inboxTask = null; inboxResult = null; inboxAt = 0; inboxAccount = accountId; }
  if (inboxResult && Date.now() - inboxAt < 500) return inboxResult as { conversations: T[] };
  if (inboxTask) return inboxTask as Promise<{ conversations: T[] }>;
  const expectedAccount = accountId;
  const task = fetch('/api/v1/dm/conversations', { credentials: 'same-origin', cache: 'no-store' })
    .then(async response => {
      if (!response.ok) throw Error('HTTP_' + response.status);
      const result = await response.json() as { conversations: unknown[] };
      if (!Array.isArray(result.conversations)) throw Error('Invalid inbox');
      if (inboxAccount === expectedAccount) { inboxResult = result; inboxAt = Date.now(); }
      return result;
    }).finally(() => { if (inboxTask === task) inboxTask = null; });
  inboxTask = task;
  return task as Promise<{ conversations: T[] }>;
}
