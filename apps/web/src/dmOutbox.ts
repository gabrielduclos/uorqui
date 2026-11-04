import { deleteDmCommand, listDmCommands, saveDmCommand, type DmCommand, type DmPending } from './dmCache';

export type DmOutboxUpdate = {
  accountId: string;
  clientId: string;
  conversationId: string;
  state: 'queued' | 'sending' | 'sent' | 'failed';
  message?: unknown;
};
const activeAccounts = new Set<string>();
const processing = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_ATTEMPTS = 8;
const keyFor = (accountId: string, clientId: string) => accountId + ':' + clientId;
function announce(command: DmCommand, state: DmOutboxUpdate['state'], message?: unknown) {
  window.dispatchEvent(new CustomEvent<DmOutboxUpdate>('uorqui:dm-outbox', {
    detail: { accountId: command.accountId, clientId: command.pending.clientId,
      conversationId: command.pending.conversationId, state, message },
  }));
}
function schedule(accountId: string, delay = 2500) {
  if (!activeAccounts.has(accountId) || timers.has(accountId)) return;
  const timer = setTimeout(() => {
    timers.delete(accountId);
    void flushDmOutbox(accountId);
  }, delay);
  timers.set(accountId, timer);
}
async function sendCommand(command: DmCommand) {
  const { pending, file } = command;
  const url = '/api/v1/dm/conversations/' + encodeURIComponent(pending.conversationId) + '/messages';
  let response: Response;
  if (pending.attachment) {
    if (!file) throw Error('MISSING_FILE');
    response = await fetch('/api/media/dm/' + encodeURIComponent(pending.conversationId), {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: {
        'Content-Type': pending.attachment.type,
        'x-uorqui-client-id': pending.clientId,
        'x-uorqui-filename': encodeURIComponent(pending.attachment.name),
        ...(pending.body ? { 'x-uorqui-caption': encodeURIComponent(pending.body) } : {}),
        ...(pending.replyToId ? { 'x-uorqui-reply-to-id': pending.replyToId } : {}),
      }, body: file,
    });
  } else {
    response = await fetch(url, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: pending.body, clientId: pending.clientId,
        ...(pending.replyToId ? { replyToId: pending.replyToId } : {}) }),
    });
  }
  if (!response.ok) {
    const error = Error('HTTP_' + response.status);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return (await response.json() as { message?: unknown }).message;
}
async function process(command: DmCommand) {
  const key = keyFor(command.accountId, command.pending.clientId);
  if (processing.has(key) || !activeAccounts.has(command.accountId)) return;
  processing.add(key);
  try {
    announce(command, 'sending');
    const message = await sendCommand(command);
    await deleteDmCommand(command);
    announce(command, 'sent', message);
  } catch (error) {
    const status = (error as { status?: number }).status;
    const attempts = command.attempts + 1;
    const permanent = status === 400 || status === 401 || status === 403 || status === 404 || status === 409 || attempts >= MAX_ATTEMPTS;
    const next: DmCommand = {
      ...command, attempts, state: permanent ? 'failed' : 'queued',
      nextAttemptAt: permanent ? 0 : Date.now() + Math.min(30000, 1000 * 2 ** attempts),
      pending: { ...command.pending, pendingStatus: permanent ? 'failed' : 'sending',
        statusUpdatedAt: new Date().toISOString() },
    };
    await saveDmCommand(next).catch(() => {});
    announce(next, permanent ? 'failed' : 'queued');
    if (!permanent) schedule(command.accountId, Math.max(1000, next.nextAttemptAt - Date.now()));
  } finally {
    processing.delete(key);
    if (activeAccounts.has(command.accountId)) schedule(command.accountId, 250);
  }
}
export async function flushDmOutbox(accountId: string): Promise<void> {
  if (!activeAccounts.has(accountId) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  const commands = await listDmCommands(accountId);
  const now = Date.now();
  const ready = commands.filter(command => command.state === 'queued' &&
    command.nextAttemptAt <= now && !processing.has(keyFor(accountId, command.pending.clientId)));
  for (const command of ready.slice(0, 2)) void process(command);
  const nextDue = commands.filter(command => command.state === 'queued' && command.nextAttemptAt > now)
    .reduce((min, command) => Math.min(min, command.nextAttemptAt), Infinity);
  if (Number.isFinite(nextDue)) schedule(accountId, Math.max(200, nextDue - Date.now()));
}
export async function enqueueDmMessage(accountId: string, pending: DmPending, file?: File): Promise<void> {
  const command: DmCommand = { accountId, pending, file, attempts: 0,
    nextAttemptAt: 0, state: 'queued' };
  await saveDmCommand(command);
  announce(command, 'queued');
  void flushDmOutbox(accountId);
}
export async function retryDmMessage(accountId: string, clientId: string): Promise<void> {
  const command = (await listDmCommands(accountId)).find(row => row.pending.clientId === clientId);
  if (!command) return;
  const updated = { ...command, state: 'queued' as const, attempts: 0, nextAttemptAt: 0,
    pending: { ...command.pending, pendingStatus: 'sending' as const,
      statusUpdatedAt: new Date().toISOString() } };
  await saveDmCommand(updated);
  announce(updated, 'queued');
  void flushDmOutbox(accountId);
}
export function startDmOutbox(accountId: string): () => void {
  activeAccounts.add(accountId);
  const resume = () => { if (document.visibilityState === 'visible') void flushDmOutbox(accountId); };
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
  void flushDmOutbox(accountId);
  return () => {
    activeAccounts.delete(accountId);
    window.removeEventListener('online', resume);
    document.removeEventListener('visibilitychange', resume);
    const timer = timers.get(accountId);
    if (timer) clearTimeout(timer);
    timers.delete(accountId);
  };
}
