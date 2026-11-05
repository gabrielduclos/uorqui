/**
 * Cache-first channel snapshots. Scoped per signed-in account and kept only in
 * memory: protected messages must not survive sign-out or be exposed to another
 * account on a shared device. The server remains authoritative for permissions.
 */
const MAX_CHANNELS = 24;
const snapshots = new Map<string, unknown[]>();

function key(accountId: string, communityId: string, channelId: string) {
  return JSON.stringify([accountId, communityId, channelId]);
}

export function peekCommunityMessages<T>(
  accountId: string, communityId: string, channelId: string,
): T[] | null {
  const cacheKey = key(accountId, communityId, channelId);
  const value = snapshots.get(cacheKey);
  if (!value) return null;
  snapshots.delete(cacheKey);
  snapshots.set(cacheKey, value);
  return value as T[];
}

export function putCommunityMessages<T>(
  accountId: string, communityId: string, channelId: string, messages: T[],
) {
  const cacheKey = key(accountId, communityId, channelId);
  snapshots.delete(cacheKey);
  snapshots.set(cacheKey, messages);
  while (snapshots.size > MAX_CHANNELS) {
    const first = snapshots.keys().next().value;
    if (first === undefined) break;
    snapshots.delete(first);
  }
}

export function forgetCommunityMessages(accountId: string, communityId: string, channelId: string) {
  snapshots.delete(key(accountId, communityId, channelId));
}

export function clearCommunityMessageCache(accountId: string) {
  for (const cacheKey of snapshots.keys()) {
    try {
      if ((JSON.parse(cacheKey) as string[])[0] === accountId) snapshots.delete(cacheKey);
    } catch {
      snapshots.delete(cacheKey);
    }
  }
}

/** Keep object identity for unchanged messages while applying the authoritative
 * server snapshot. A stable array prevents unnecessary work on SSE reconnects.
 */
export function reconcileCommunityMessages<T extends { id: string }>(
  previous: T[], incoming: T[],
): T[] {
  const existing = new Map(previous.map(message => [message.id, message]));
  const result = incoming.map(message => {
    const current = existing.get(message.id);
    return current && JSON.stringify(current) === JSON.stringify(message) ? current : message;
  });
  return result.length === previous.length &&
    result.every((message, index) => message === previous[index]) ? previous : result;
}
