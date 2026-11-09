import pg from 'pg';
import { getPool } from './db/client.js';

const { Client } = pg;
const CHANNEL = 'uorqui_dm_events';
export type DmEventKind = 'message' | 'read' | 'conversation' | 'update' | 'received' | 'friendship-update' | 'notification' | 'instance-lease';
export type DmEvent = { userId: string; conversationId: string; kind: DmEventKind; message?: Record<string, unknown> };
type Subscriber = (event: Omit<DmEvent, 'userId'>) => void;

// One dedicated PostgreSQL LISTEN connection per API process (never one per browser).
// LISTEN requires a session-capable connection; use DATABASE_DIRECT_URL on Neon
// when the application's DATABASE_URL goes through PgBouncer transaction pooling.
const subscribers = new Map<string, Set<Subscriber>>();
let listener: pg.Client | null = null;
let starting: Promise<void> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let closing = false;

function scheduleRetry() {
  if (closing || retry || subscribers.size === 0) return;
  retry = setTimeout(() => {
    retry = null;
    void ensureListener().catch(() => { /* connection failures are retried */ });
  }, 3000);
  retry.unref?.();
}

async function ensureListener(): Promise<void> {
  if (closing || listener || subscribers.size === 0) return;
  if (starting) return starting;
  const raw = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!raw) return;
  // Neon transaction-pooler endpoints cannot reliably maintain LISTEN sessions.
  // Use an explicit unpooled URL when provided, otherwise convert Neon's
  // documented -pooler hostname to its direct equivalent for this one client.
  const address = new URL(raw);
  if (!process.env.DATABASE_DIRECT_URL && /-pooler(?=\.)/.test(address.hostname)) {
    address.hostname = address.hostname.replace(/-pooler(?=\.)/, '');
  }
  const connection = new Client({ connectionString: address.toString(), connectionTimeoutMillis: 8000 });
  starting = (async () => {
    try {
      connection.on('notification', packet => {
        if (packet.channel !== CHANNEL || !packet.payload) return;
        try {
          const event = JSON.parse(packet.payload) as DmEvent;
          if (!event || typeof event.userId !== 'string' ||
              typeof event.conversationId !== 'string' ||
              !['message', 'read', 'conversation', 'update', 'received', 'friendship-update', 'notification', 'instance-lease'].includes(event.kind)) return;
          for (const subscriber of subscribers.get(event.userId) ?? []) {
            try { subscriber({ kind: event.kind, conversationId: event.conversationId, message: event.message }); }
            catch { /* ignore disconnected browser writer */ }
          }
        } catch { /* discard untrusted notification payloads */ }
      });
      const disconnected = () => {
        if (listener === connection) listener = null;
        scheduleRetry();
      };
      connection.on('error', disconnected);
      connection.on('end', disconnected);
      await connection.connect();
      await connection.query('LISTEN ' + CHANNEL);
      listener = connection;
    } catch {
      await connection.end().catch(() => {});
      scheduleRetry();
    } finally {
      starting = null;
    }
  })();
  await starting;
}

export async function subscribeDmEvents(userId: string, callback: Subscriber): Promise<() => void> {
  if (closing) return () => {};
  let set = subscribers.get(userId);
  if (!set) { set = new Set(); subscribers.set(userId, set); }
  set.add(callback);
  await ensureListener().catch(() => scheduleRetry());
  return () => {
    const current = subscribers.get(userId);
    current?.delete(callback);
    if (current?.size === 0) subscribers.delete(userId);
  };
}

export async function publishDmConversationEvent(conversationId: string, kind: DmEventKind, message?: Record<string, unknown>): Promise<void> {
  // One SQL round trip for membership lookup and both authenticated notifications.
  // The API and Neon may run in different regions: avoid sequential Pg queries.
  const testPayload = JSON.stringify({
    userId: '00000000-0000-0000-0000-000000000000', conversationId, kind, message,
  });
  const compactMessage = message && Buffer.byteLength(testPayload, 'utf8') < 7500
    ? JSON.stringify(message) : null;
  await getPool().query(
    `SELECT pg_notify($1, json_build_object(
      'userId', participant.recipient, 'conversationId', $2::text, 'kind', $3::text,
      'message', $4::jsonb
    )::text)
    FROM direct_conversations c
    CROSS JOIN LATERAL unnest(ARRAY[c.participant_a_id, c.participant_b_id]) participant(recipient)
    WHERE c.id=$2::uuid`,
    [CHANNEL, conversationId, kind, compactMessage],
  );
}

export async function closeDmEvents(): Promise<void> {
  closing = true;
  if (retry) { clearTimeout(retry); retry = null; }
  subscribers.clear();
  if (starting) await starting.catch(() => {});
  const current = listener;
  listener = null;
  if (current) await current.end().catch(() => {});
}

/** Send a signal only (no names, content or profile data) to the affected account. */
export async function publishDmUserEvent(userId: string, kind: DmEventKind): Promise<void> {
  await getPool().query('SELECT pg_notify($1, $2)', [
    CHANNEL, JSON.stringify({ userId, conversationId: '', kind } satisfies DmEvent),
  ]);
}
