import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type MailProvider = 'gmail' | 'outlook';
export type MailTokens = { access_token: string; refresh_token: string; expires_at: number };
export type MailMessage = { id: string; from: string; to: string; subject: string; preview: string; date: string; unread: boolean; starred: boolean; body?: string };
export const isMailProvider = (value: string): value is MailProvider => value === 'gmail' || value === 'outlook';
export const stateHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomSecret = () => randomBytes(32).toString('base64url');

function encryptionKey() {
  const key = Buffer.from(process.env.MAIL_TOKEN_KEY ?? '', 'base64');
  if (key.length !== 32) throw Error('MAIL_NOT_CONFIGURED');
  return key;
}
export function sealMailSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
export function openMailSecret(value: string) {
  const bytes = Buffer.from(value, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8');
}
export function mailConfig(provider: MailProvider) {
  encryptionKey();
  const prefix = provider === 'gmail' ? 'MAIL_GOOGLE' : 'MAIL_MICROSOFT';
  const clientId = process.env[prefix + '_CLIENT_ID'];
  const clientSecret = process.env[prefix + '_CLIENT_SECRET'];
  const origin = new URL(process.env.WEB_ORIGIN ?? 'http://localhost:5173');
  if (!clientId || !clientSecret || (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')) throw Error('MAIL_NOT_CONFIGURED');
  return { clientId, clientSecret, redirectUri: origin.origin + '/api/v1/mail/oauth/' + provider + '/callback',
    authorize: provider === 'gmail' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: provider === 'gmail' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: provider === 'gmail' ? 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send' : 'offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send' };
}
export function mailProviderReady(provider: MailProvider) { try { mailConfig(provider); return true; } catch { return false; } }
export function authorizationUrl(provider: MailProvider, state: string, verifier: string) {
  const config = mailConfig(provider);
  const query = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code',
    scope: config.scope, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    ...(provider === 'gmail' ? { access_type: 'offline', prompt: 'consent' } : { prompt: 'select_account' }) });
  return config.authorize + '?' + query;
}

// Never include upstream error bodies or OAuth credentials in logs/errors.
async function providerFetch(url: string, init: RequestInit, oauth = false): Promise<Response> {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw Error(response.status === 401 || response.status === 403 || (oauth && response.status === 400) ? 'MAIL_RECONNECT' : 'MAIL_PROVIDER_UNAVAILABLE');
  return response;
}
export async function exchangeTokens(provider: MailProvider, fields: Record<string, string>, previousRefresh = ''): Promise<MailTokens> {
  const config = mailConfig(provider);
  const response = await providerFetch(config.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, ...fields }) }, true);
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!data.access_token || !(data.refresh_token || previousRefresh)) throw Error('MAIL_RECONNECT');
  const required = provider === 'gmail' ? ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'] : ['Mail.Read', 'Mail.Send', 'User.Read'];
  if (data.scope && required.some(scope => !data.scope!.split(' ').some(granted => granted === scope || granted === 'https://graph.microsoft.com/' + scope))) throw Error('MAIL_RECONNECT');
  return { access_token: data.access_token, refresh_token: data.refresh_token || previousRefresh,
    expires_at: Date.now() + Math.max(0, Number(data.expires_in ?? 3600)) * 1000 };
}
function headers(token: string) { return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'outlook.body-content-type="text"' }; }
export async function mailboxEmail(provider: MailProvider, token: string) {
  const response = await providerFetch(provider === 'gmail' ? 'https://gmail.googleapis.com/gmail/v1/users/me/profile' :
    'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', { headers: headers(token) });
  const data = await response.json() as { emailAddress?: string; mail?: string; userPrincipalName?: string };
  const email = data.emailAddress || data.mail || data.userPrincipalName;
  if (!email || email.length > 320) throw Error('MAIL_PROVIDER_UNAVAILABLE');
  return email;
}
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailMessage = { id: string; snippet?: string; labelIds?: string[]; internalDate?: string; payload?: GmailPart & { headers?: { name: string; value: string }[] } };
function plainPart(part?: GmailPart): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  return (part.parts ?? []).map(plainPart).filter(Boolean).join('\n');
}
function gmailMessage(data: GmailMessage, full: boolean): MailMessage {
  const header = (key: string) => data.payload?.headers?.find(h => h.name.toLowerCase() === key)?.value ?? '';
  return { id: data.id, from: header('from'), to: header('to'), subject: header('subject'), preview: data.snippet ?? '',
    date: new Date(Number(data.internalDate ?? 0)).toISOString(), unread: data.labelIds?.includes('UNREAD') ?? false,
    starred: data.labelIds?.includes('STARRED') ?? false, ...(full ? { body: plainPart(data.payload) || data.snippet || '' } : {}) };
}
type OutlookMessage = { id: string; subject?: string; bodyPreview?: string; receivedDateTime?: string; sentDateTime?: string; isRead?: boolean;
  flag?: { flagStatus?: string }; from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[]; body?: { content?: string } };
function outlookMessage(data: OutlookMessage, full: boolean): MailMessage {
  const sender = data.from?.emailAddress;
  return { id: data.id, from: sender?.name ? `${sender.name} <${sender.address ?? ''}>` : sender?.address ?? '',
    to: data.toRecipients?.map(item => item.emailAddress?.address ?? '').join(', ') ?? '', subject: data.subject ?? '', preview: data.bodyPreview ?? '',
    date: data.receivedDateTime || data.sentDateTime || '', unread: !data.isRead, starred: data.flag?.flagStatus === 'flagged',
    ...(full ? { body: data.body?.content || data.bodyPreview || '' } : {}) };
}
export async function getMailMessage(provider: MailProvider, token: string, id: string) {
  const response = await providerFetch(provider === 'gmail' ? 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(id) + '?format=full' :
    'https://graph.microsoft.com/v1.0/me/messages/' + encodeURIComponent(id), { headers: headers(token) });
  return provider === 'gmail' ? gmailMessage(await response.json() as GmailMessage, true) : outlookMessage(await response.json() as OutlookMessage, true);
}
export async function listMail(provider: MailProvider, token: string, folder: 'inbox' | 'sent', filter: 'all' | 'unread' | 'starred', page = '') {
  if (provider === 'gmail') {
    const query = new URLSearchParams({ maxResults: '20', q: (folder === 'sent' ? 'in:sent' : 'in:inbox') + (filter === 'unread' ? ' is:unread' : filter === 'starred' ? ' is:starred' : ''), ...(page ? { pageToken: page } : {}) });
    const response = await providerFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?' + query, { headers: headers(token) });
    const data = await response.json() as { messages?: { id: string }[]; nextPageToken?: string };
    const messages: MailMessage[] = [];
    // Bound concurrent provider calls; a full inbox never creates an unbounded fan-out.
    const rows = data.messages ?? [];
    for (let i = 0; i < rows.length; i += 5) messages.push(...await Promise.all(rows.slice(i, i + 5).map(async item => {
      const detail = await providerFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(item.id) + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject', { headers: headers(token) });
      return gmailMessage(await detail.json() as GmailMessage, false);
    })));
    return { messages, nextPage: data.nextPageToken ?? null };
  }
  const query = new URLSearchParams({ '$top': '20', '$orderby': 'receivedDateTime desc',
    '$select': 'id,from,toRecipients,subject,bodyPreview,receivedDateTime,isRead,flag',
    ...(filter === 'unread' ? { '$filter': 'receivedDateTime ge 1970-01-01T00:00:00Z and isRead eq false' } : filter === 'starred' ? { '$filter': "receivedDateTime ge 1970-01-01T00:00:00Z and flag/flagStatus eq 'flagged'" } : {}) });
  // Only provider pagination values are accepted; callers cannot choose a fetch host/path.
  if (page) {
    const cursor = new URLSearchParams(page);
    for (const key of ['$skip', '$skiptoken']) if (cursor.has(key)) query.set(key, cursor.get(key)!);
  }
  const response = await providerFetch('https://graph.microsoft.com/v1.0/me/mailFolders/' + (folder === 'sent' ? 'sentitems' : 'inbox') + '/messages?' + query, { headers: headers(token) });
  const data = await response.json() as { value?: OutlookMessage[]; '@odata.nextLink'?: string };
  let nextPage: string | null = null;
  if (data['@odata.nextLink']) {
    const next = new URL(data['@odata.nextLink']);
    const cursor = new URLSearchParams();
    for (const key of ['$skip', '$skiptoken']) if (next.searchParams.has(key)) cursor.set(key, next.searchParams.get(key)!);
    nextPage = cursor.toString() || null;
  }
  return { messages: (data.value ?? []).map(item => outlookMessage(item, false)), nextPage };
}
export async function sendMail(provider: MailProvider, token: string, sender: string, message: { to: string; subject: string; body: string }) {
  if (provider === 'gmail') {
    if (/[\r\n]/.test(sender)) throw Error('MAIL_PROVIDER_UNAVAILABLE');
    const raw = ['From: ' + sender, 'To: ' + message.to, 'Subject: =?UTF-8?B?' + Buffer.from(message.subject).toString('base64') + '?=',
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
      Buffer.from(message.body).toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? ''].join('\r\n');
    await providerFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: headers(token), body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }) });
  } else {
    await providerFetch('https://graph.microsoft.com/v1.0/me/sendMail', { method: 'POST', headers: headers(token), body: JSON.stringify({
      message: { subject: message.subject, body: { contentType: 'Text', content: message.body }, toRecipients: [{ emailAddress: { address: message.to } }] }, saveToSentItems: true,
    }) });
  }
}
