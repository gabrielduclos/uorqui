/** The owner identifier is stable for this browser/PWA installation and account.
 * The browser Web Lock below prevents two simultaneously opened documents from
 * using this shared identifier as if they were one tab.
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function persistentInstanceId(
  store: Pick<Storage, 'getItem' | 'setItem'>,
  accountId: string, kind: 'desktop' | 'mobile',
  randomId: () => string = () => crypto.randomUUID(),
): string {
  const key = 'uorqui:instance-browser:v2:' + accountId + ':' + kind;
  try {
    const previous = store.getItem(key);
    if (previous && UUID.test(previous)) return previous;
    const created = randomId();
    store.setItem(key, created);
    return created;
  } catch {
    // Disabled storage falls back to a document ID, which remains safe but
    // cannot recover an active lease after a browser restart.
    return randomId();
  }
}

/** Hold an origin-scoped, account/category-specific Web Lock for the lifetime
 * of the active document. The lock is automatically released on tab/process
 * termination; an explicit takeover steals it from an existing local tab.
 */
export function acquireDocumentLock(
  locks: Pick<LockManager, 'request'>,
  name: string,
  takeover: boolean,
): Promise<(() => void) | null> {
  return new Promise(resolve => {
    let settled = false;
    const done = (release: (() => void) | null) => {
      if (!settled) { settled = true; resolve(release); }
    };
    void locks.request(
      name,
      takeover ? { mode: 'exclusive', steal: true } : { mode: 'exclusive', ifAvailable: true },
      async lock => {
        if (!lock) { done(null); return; }
        await new Promise<void>(release => done(release));
      },
    ).catch(() => done(null));
  });
}

type Presence = { type: string; accountId: string; kind: string; pageId: string; probeId?: string; replyTo?: string };

/** Last-resort same-browser detection when the Web Locks API is unavailable.
 * Most current browser/PWA engines support Web Locks, which are the stronger
 * atomic local arbitration layer.
 */
export function anotherDocumentPresent(
  channel: BroadcastChannel, accountId: string, kind: 'desktop' | 'mobile',
  pageId: string, waitMs = 180,
): Promise<boolean> {
  return new Promise(resolve => {
    const probeId = crypto.randomUUID();
    const finish = (found: boolean) => {
      clearTimeout(timer);
      channel.removeEventListener('message', onMessage);
      resolve(found);
    };
    const onMessage = (event: MessageEvent<Presence>) => {
      const message = event.data;
      if (message?.type === 'present' && message.accountId === accountId &&
          message.kind === kind && message.replyTo === probeId && message.pageId !== pageId) finish(true);
    };
    const timer = setTimeout(() => finish(false), waitMs);
    channel.addEventListener('message', onMessage);
    channel.postMessage({ type: 'probe', accountId, kind, pageId, probeId } satisfies Presence);
  });
}
