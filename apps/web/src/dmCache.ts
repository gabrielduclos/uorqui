import type { DirectChatMessage } from './DirectMessageBubble';

/**
 * Account-scoped, bounded local snapshots. HTTP remains authoritative: IndexedDB
 * only supplies a quick first paint and durable commands after authentication.
 * Never put these responses in the service worker's shared HTTP cache.
 */
export type DmPending = DirectChatMessage & {
  clientId: string;
  pendingStatus: 'sending' | 'failed';
  statusUpdatedAt: string;
};
export type DmCommand = {
  accountId: string;
  pending: DmPending;
  file?: File;
  attempts: number;
  nextAttemptAt: number;
  state: 'queued' | 'failed';
};
const DB_NAME = 'uorqui-direct-messages';
const DB_VERSION = 1;
const rooms = new Map<string, DirectChatMessage[]>();
const inboxes = new Map<string, unknown[]>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
const roomKey = (accountId: string, conversationId: string) => accountId + ':' + conversationId;
const commandKey = (command: DmCommand) => roomKey(command.accountId, command.pending.clientId);

function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DB_NAME, DB_VERSION); } catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('rooms')) db.createObjectStore('rooms', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('inboxes')) db.createObjectStore('inboxes', { keyPath: 'accountId' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}
async function read<T>(table: string, key: IDBValidKey): Promise<T | null> {
  const db = await database();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const request = db.transaction(table, 'readonly').objectStore(table).get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function write(table: string, row: unknown, key?: IDBValidKey): Promise<void> {
  const db = await database();
  if (!db) throw new Error('Local storage unavailable');
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(table, 'readwrite');
      tx.objectStore(table).put(row, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || Error('Local storage error'));
      tx.onabort = () => reject(tx.error || Error('Local storage interrupted'));
    } catch (error) { reject(error); }
  });
}
async function erase(table: string, key: IDBValidKey): Promise<void> {
  const db = await database();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(table, 'readwrite');
      tx.objectStore(table).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}
export function peekDmRoom(accountId: string, conversationId: string): DirectChatMessage[] {
  return rooms.get(roomKey(accountId, conversationId)) ?? [];
}
export async function readDmRoom(accountId: string, conversationId: string): Promise<DirectChatMessage[]> {
  const key = roomKey(accountId, conversationId);
  const cached = await read<{ messages: DirectChatMessage[] }>('rooms', key);
  if (!cached || !Array.isArray(cached.messages)) return peekDmRoom(accountId, conversationId);
  if (!rooms.has(key)) rooms.set(key, cached.messages);
  return peekDmRoom(accountId, conversationId);
}
export function saveDmRoom(accountId: string, conversationId: string, messages: DirectChatMessage[]): void {
  const key = roomKey(accountId, conversationId);
  const bounded = messages.filter(row => !row.deletedAt && !row.pendingStatus).slice(-120);
  rooms.set(key, bounded);
  void write('rooms', { key, messages: bounded }).catch(() => {});
}
export function peekDmInbox<T>(accountId: string): T[] {
  return (inboxes.get(accountId) ?? []) as T[];
}
export async function readDmInbox<T>(accountId: string): Promise<T[]> {
  const cached = await read<{ conversations: T[] }>('inboxes', accountId);
  if (cached && Array.isArray(cached.conversations) && !inboxes.has(accountId))
    inboxes.set(accountId, cached.conversations);
  return peekDmInbox<T>(accountId);
}
export function saveDmInbox<T>(accountId: string, conversations: T[]): void {
  inboxes.set(accountId, conversations.slice(0, 100));
  void write('inboxes', { accountId, conversations: conversations.slice(0, 100) }).catch(() => {});
}
export async function saveDmCommand(command: DmCommand): Promise<void> {
  const key = commandKey(command);
  // Blob URLs belong to one browser process. Persist the File itself for recovery.
  await write('outbox', { ...command, pending: { ...command.pending, attachmentUrl: undefined }, key });
}
export async function listDmCommands(accountId: string): Promise<DmCommand[]> {
  const db = await database();
  if (!db) return [];
  return new Promise(resolve => {
    try {
      const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
      request.onsuccess = () => resolve((request.result as (DmCommand & { key: string })[])
        .filter(row => row.accountId === accountId).map(({ key: _key, ...command }) => command));
      request.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}
export async function deleteDmCommand(command: DmCommand): Promise<void> {
  await erase('outbox', commandKey(command));
}
export async function clearDmConversation(accountId: string, conversationId: string): Promise<void> {
  const key = roomKey(accountId, conversationId);
  rooms.delete(key);
  await erase('rooms', key);
  for (const command of await listDmCommands(accountId)) {
    if (command.pending.conversationId === conversationId) await deleteDmCommand(command);
  }
}
export async function clearDmAccount(accountId: string): Promise<void> {
  inboxes.delete(accountId);
  for (const key of rooms.keys()) if (key.startsWith(accountId + ':')) rooms.delete(key);
  await erase('inboxes', accountId);
  const db = await database();
  if (!db) return;
  for (const table of ['rooms', 'outbox']) {
    const keys = await new Promise<IDBValidKey[]>(resolve => {
      try {
        const request = db.transaction(table, 'readonly').objectStore(table).getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve([]);
      } catch { resolve([]); }
    });
    for (const key of keys) if (String(key).startsWith(accountId + ':')) await erase(table, key);
  }
}
