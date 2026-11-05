import { getPool } from './db/client.js';
import { exchangeTokens, openMailSecret, sealMailSecret, type MailProvider, type MailTokens } from './mail-providers.js';

export type MailConnection = { id: string; provider: MailProvider; email: string; tokens: string };

/** Serializes refreshing encrypted credentials across UI requests and background scans. */
export async function withMailbox<T>(userId: string, accountId: string, run: (connection: MailConnection, token: string) => Promise<T>): Promise<T | null> {
  // Serializing refreshes prevents overwriting rotating Microsoft refresh tokens.
  const db = await getPool().connect();
  let connection: MailConnection;
  let credential = '';
  let transactionActive = false;
  try {
    await db.query('BEGIN'); transactionActive = true;
    const found = await db.query<MailConnection>('SELECT id,provider,email,tokens FROM mail_connections WHERE id=$1 AND user_id=$2 FOR UPDATE', [accountId, userId]);
    if (!found.rows[0]) { await db.query('ROLLBACK'); transactionActive = false; return null; }
    connection = found.rows[0];
    const stored = openMailSecret(connection.tokens);
    if (connection.provider === 'manual') {
      credential = stored; // Encrypted settings; never sent to the browser.
    } else {
      let tokens = JSON.parse(stored) as MailTokens;
      if (tokens.expires_at < Date.now() + 60_000) {
        tokens = await exchangeTokens(connection.provider, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token }, tokens.refresh_token);
        await db.query('UPDATE mail_connections SET tokens=$1,updated_at=now() WHERE id=$2', [sealMailSecret(JSON.stringify(tokens)), accountId]);
      }
      credential = tokens.access_token;
    }
    await db.query('COMMIT'); transactionActive = false;
  } catch (error) { if (transactionActive) await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
  return run(connection!, credential);
}

