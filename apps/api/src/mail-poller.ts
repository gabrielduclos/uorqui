import type { FastifyInstance } from 'fastify';
import { getPool } from './db/client.js';
import { withMailbox } from './mail-account-access.js';
import { countInboxUnread, listMail, type MailMessage, type MailProvider } from './mail-providers.js';
import { pushMailNotification } from './push-routes.js';

type Account = { id: string; user_id: string; provider: MailProvider };
const validId = /^[A-Za-z0-9_=+/\-]{1,1024}$/;
const MAX_ACCOUNTS_PER_TICK = 6;
const MAX_MESSAGES_PER_SCAN = 20;

/** A previously unseen inbox item is new only if it arrived around or after
 * this account's initial baseline. Never blast old inbox contents on rollout. */
export function newlyArrivedMail(message: Pick<MailMessage,'date'>, baseline: Date): boolean {
  const received = Date.parse(message.date);
  return Number.isFinite(received) && received >= baseline.getTime() - 120_000;
}

async function pollAccount(account: Account) {
  const snapshot = await withMailbox(account.user_id, account.id, async (connection, token) => {
    const [inbox, unreadCount] = await Promise.all([
      listMail(connection.provider, token, 'inbox', 'all', ''),
      countInboxUnread(connection.provider, token),
    ]);
    return { messages: inbox.messages.slice(0, MAX_MESSAGES_PER_SCAN)
      .filter(message => validId.test(message.id)), unreadCount: Math.max(0,Math.floor(unreadCount)) };
  });
  if (!snapshot) return; // Removed or disconnected while being scanned.
  const client = await getPool().connect();
  let notifications: MailMessage[] = [];
  try {
    await client.query('BEGIN');
    // Multiple API replicas may poll; a transaction lock makes the initial
    // snapshot and message-ID deduplication atomic across instances.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',[account.id]);
    const prior = await client.query<{ initialized_at: Date }>(
      'SELECT initialized_at FROM mail_inbox_state WHERE account_id=$1 FOR UPDATE',[account.id]);
    const firstScan = !prior.rows.length;
    if (firstScan) {
      await client.query('INSERT INTO mail_inbox_state(account_id,unread_count) VALUES($1,$2)',
        [account.id,snapshot.unreadCount]);
    } else {
      await client.query('UPDATE mail_inbox_state SET unread_count=$2,last_checked_at=now() WHERE account_id=$1',
        [account.id,snapshot.unreadCount]);
    }
    if (snapshot.messages.length) {
      const params: string[] = [account.id];
      const values = snapshot.messages.map((message,i)=>{
        params.push(message.id);
        return '($1,$'+(i+2)+')';
      });
      const added = await client.query<{ message_id: string }>(
        'INSERT INTO mail_seen_messages(account_id,message_id) VALUES ' + values.join(',') +
        ' ON CONFLICT DO NOTHING RETURNING message_id',params);
      if (!firstScan) {
        const unseen = new Set(added.rows.map(row => row.message_id));
        const baseline = new Date(prior.rows[0].initialized_at);
        notifications = snapshot.messages.filter(message =>
          unseen.has(message.id) && newlyArrivedMail(message, baseline));
      }
    }
    await client.query('COMMIT');
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { client.release(); }
  // Never hold a DB transaction while making outbound push requests.
  for (const message of notifications.slice(0, MAX_MESSAGES_PER_SCAN)) {
    await pushMailNotification(account.user_id, account.id, message);
  }
}

export function startMailInboxPolling(app: FastifyInstance) {
  const configured = Number(process.env.MAIL_POLL_INTERVAL_MS ?? 120_000);
  const interval = Number.isSafeInteger(configured) ? Math.max(60_000,Math.min(configured,3_600_000)) : 120_000;
  let running = false, stopped = false;
  const retryAfter = new Map<string,number>();
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const accounts = await getPool().query<Account>(
        'SELECT m.id,m.user_id,m.provider FROM mail_connections m '+
        'LEFT JOIN mail_inbox_state s ON s.account_id=m.id '+
        'ORDER BY s.last_checked_at ASC NULLS FIRST,m.id ASC LIMIT 40');
      let scanned = 0;
      for (const account of accounts.rows) {
        if (stopped || scanned >= MAX_ACCOUNTS_PER_TICK) break;
        if ((retryAfter.get(account.id) ?? 0) > Date.now()) continue;
        scanned++;
        try { await pollAccount(account); retryAfter.delete(account.id); }
        catch {
          // Don't log provider credentials or mail headers. Failed accounts
          // retry later without starving healthy ones.
          app.log.warn({ accountId: account.id }, 'Mail inbox polling failed');
          retryAfter.set(account.id,Date.now()+5*60_000);
        }
      }
    } catch {
      app.log.warn('Mail polling unavailable; check schema migration and provider status');
    } finally { running = false; }
  };
  const initial = setTimeout(()=>void tick(),15_000);
  const periodic = setInterval(()=>void tick(),interval);
  initial.unref(); periodic.unref();
  app.addHook('onClose',async()=>{
    stopped = true;
    clearTimeout(initial);
    clearInterval(periodic);
  });
}
