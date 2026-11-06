import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getManualMessage, listManualMail, countManualInboxUnread, sendManualMail, markManualRead, replyManualMail, moveManualMessages } from './manual-mail.js';

export type OAuthMailProvider = 'gmail' | 'outlook';
export type MailProvider = OAuthMailProvider | 'manual';
export type MailTokens = { access_token: string; refresh_token: string; expires_at: number };
export type MailFolder = 'inbox' | 'sent' | 'spam' | 'trash';
export type MailMessage = { id: string; from: string; to: string; subject: string; preview: string; date: string; unread: boolean; starred: boolean; body?: string; html?: string };
export const isMailProvider = (value: string): value is OAuthMailProvider => value === 'gmail' || value === 'outlook';
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
export function mailConfig(provider: OAuthMailProvider) {
  encryptionKey();
  const prefix = provider === 'gmail' ? 'MAIL_GOOGLE' : 'MAIL_MICROSOFT';
  const clientId = process.env[prefix + '_CLIENT_ID'];
  const clientSecret = process.env[prefix + '_CLIENT_SECRET'];
  const origin = new URL(process.env.WEB_ORIGIN ?? 'http://localhost:5173');
  if (!clientId || !clientSecret || (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')) throw Error('MAIL_NOT_CONFIGURED');
  return { clientId, clientSecret, redirectUri: origin.origin + '/api/v1/mail/oauth/' + provider + '/callback',
    authorize: provider === 'gmail' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: provider === 'gmail' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: provider === 'gmail' ? 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send' : 'offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send' };
}
export function mailProviderReady(provider: OAuthMailProvider) { try { mailConfig(provider); return true; } catch { return false; } }
export function authorizationUrl(provider: OAuthMailProvider, state: string, verifier: string) {
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
export async function exchangeTokens(provider: OAuthMailProvider, fields: Record<string, string>, previousRefresh = ''): Promise<MailTokens> {
  const config = mailConfig(provider);
  const response = await providerFetch(config.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, ...fields }) }, true);
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!data.access_token || !(data.refresh_token || previousRefresh)) throw Error('MAIL_RECONNECT');
  const required = provider === 'gmail' ? ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send'] : ['Mail.ReadWrite', 'Mail.Send', 'User.Read'];
  if (data.scope && required.some(scope => !data.scope!.split(' ').some(granted => granted === scope || granted === 'https://graph.microsoft.com/' + scope))) throw Error('MAIL_RECONNECT');
  return { access_token: data.access_token, refresh_token: data.refresh_token || previousRefresh,
    expires_at: Date.now() + Math.max(0, Number(data.expires_in ?? 3600)) * 1000 };
}
function headers(token: string) { return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'outlook.body-content-type="text"' }; }
export async function mailboxEmail(provider: OAuthMailProvider, token: string) {
  const response = await providerFetch(provider === 'gmail' ? 'https://gmail.googleapis.com/gmail/v1/users/me/profile' :
    'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', { headers: headers(token) });
  const data = await response.json() as { emailAddress?: string; mail?: string; userPrincipalName?: string };
  const email = data.emailAddress || data.mail || data.userPrincipalName;
  if (!email || email.length > 320) throw Error('MAIL_PROVIDER_UNAVAILABLE');
  return email;
}
type GmailPart = { mimeType?: string; body?: { data?: string; attachmentId?: string; size?: number }; filename?: string; headers?: { name: string; value: string }[]; parts?: GmailPart[] };
type GmailMessage = { id: string; threadId?: string; snippet?: string; labelIds?: string[]; internalDate?: string; payload?: GmailPart };
function plainPart(part?: GmailPart): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  return (part.parts ?? []).map(plainPart).filter(Boolean).join('\n');
}
function htmlPart(part?: GmailPart): GmailPart | undefined {
  if (!part) return undefined;
  if (part.mimeType?.toLowerCase() === 'text/html') return part;
  for (const child of part.parts ?? []) { const found = htmlPart(child); if (found) return found; }
  return undefined;
}
async function gmailHtml(data: GmailMessage, token: string): Promise<string | undefined> {
  const part = htmlPart(data.payload);
  if (!part?.body?.data) return undefined;
  let html = Buffer.from(part.body.data, 'base64url').toString('utf8');
  // Never download an unbounded mail body or inline attachment collection.
  if (Buffer.byteLength(html) > 500_000) return undefined;
  const images: GmailPart[] = [];
  function visit(node?: GmailPart) {
    if (!node || images.length >= 12) return;
    const contentId = node.headers?.find(h => h.name.toLowerCase() === 'content-id')?.value;
    if (contentId && /^image\/(png|jpeg|gif|webp)$/i.test(node.mimeType ?? '')) images.push(node);
    for (const child of node.parts ?? []) visit(child);
  }
  visit(data.payload);
  let total = 0;
  for (const item of images) {
    const contentId = item.headers?.find(h => h.name.toLowerCase() === 'content-id')?.value?.replace(/^<|>$/g, '').trim();
    if (!contentId || !(item.body?.data || item.body?.attachmentId)) continue;
    let content = item.body?.data;
    if (!content && item.body?.attachmentId && (item.body?.size ?? 0) <= 1_000_000) {
      try {
        const attachment = await providerFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' +
          encodeURIComponent(data.id) + '/attachments/' + encodeURIComponent(item.body.attachmentId), { headers: headers(token) });
        const value = await attachment.json() as { data?: string; size?: number };
        if (value.size && value.size > 1_000_000) continue;
        content = value.data;
      } catch { continue; } // One broken inline image must not hide the message body.
    }
    if (!content) continue;
    const bytes = Buffer.from(content, 'base64url');
    if (bytes.length > 1_000_000 || total + bytes.length > 3_000_000) continue;
    total += bytes.length;
    const dataUri = 'data:' + item.mimeType!.toLowerCase() + ';base64,' + bytes.toString('base64');
    const escaped = contentId.split('').map(ch => '\\^$.*+?()[]{}|'.includes(ch) ? '\\' + ch : ch).join('');
    html = html.replace(new RegExp('cid:' + escaped, 'gi'), dataUri);
  }
  return html;
}
function gmailMessage(data: GmailMessage, full: boolean, html?: string): MailMessage {
  const header = (key: string) => data.payload?.headers?.find(h => h.name.toLowerCase() === key)?.value ?? '';
  return { id: data.id, from: header('from'), to: header('to'), subject: header('subject'), preview: data.snippet ?? '',
    date: new Date(Number(data.internalDate ?? 0)).toISOString(), unread: data.labelIds?.includes('UNREAD') ?? false,
    starred: data.labelIds?.includes('STARRED') ?? false, ...(full ? { body: plainPart(data.payload) || data.snippet || '', ...(html ? { html } : {}) } : {}) };
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
  if (provider === 'manual') return getManualMessage(token, id);
  const response = await providerFetch(provider === 'gmail' ? 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(id) + '?format=full' :
    'https://graph.microsoft.com/v1.0/me/messages/' + encodeURIComponent(id) + '?$select=id,from,toRecipients,subject,bodyPreview,receivedDateTime,sentDateTime,isRead,flag,body', {
      headers: provider === 'gmail' ? headers(token) : { ...headers(token), Prefer: 'outlook.body-content-type="html"' },
    });
  if (provider === 'gmail') {
    const data = await response.json() as GmailMessage;
    return gmailMessage(data, true, await gmailHtml(data, token));
  }
  const data = await response.json() as OutlookMessage;
  return { ...outlookMessage(data, true), ...(data.body?.content ? { html: data.body.content } : {}) };
}
export async function listMail(provider: MailProvider, token: string, folder: MailFolder, filter: 'all' | 'unread' | 'starred', page = '') {
  if (provider === 'manual') return listManualMail(token, folder, filter, page);
  if (provider === 'gmail') {
    const query = new URLSearchParams({ maxResults: '20',
      labelIds: ({ inbox: 'INBOX', sent: 'SENT', spam: 'SPAM', trash: 'TRASH' } as const)[folder],
      ...(folder === 'spam' || folder === 'trash' ? { includeSpamTrash: 'true' } : {}),
      ...(filter !== 'all' ? { q: filter === 'unread' ? 'is:unread' : 'is:starred' } : {}),
      ...(page ? { pageToken: page } : {}) });
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
  const response = await providerFetch('https://graph.microsoft.com/v1.0/me/mailFolders/' + ({ inbox: 'inbox', sent: 'sentitems', spam: 'junkemail', trash: 'deleteditems' } as const)[folder] + '/messages?' + query, { headers: headers(token) });
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
/** Number of unread messages in the actual Inbox (not Spam or Trash).
 * This is read from providers, then cached in mail_inbox_state for the menu. */
export async function countInboxUnread(provider: MailProvider, token: string): Promise<number> {
  if (provider === 'manual') return countManualInboxUnread(token);
  if (provider === 'gmail') {
    const query = new URLSearchParams({labelIds:'INBOX',q:'is:unread',maxResults:'1'});
    const result = await providerFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?' + query, {headers:headers(token)});
    const data = await result.json() as {resultSizeEstimate?:number};
    return Math.max(0,Math.floor(Number(data.resultSizeEstimate ?? 0)));
  }
  const result = await providerFetch('https://graph.microsoft.com/v1.0/me/mailFolders/inbox?$select=unreadItemCount',{headers:headers(token)});
  const data = await result.json() as {unreadItemCount?:number};
  return Math.max(0,Math.floor(Number(data.unreadItemCount ?? 0)));
}

export async function sendMail(provider: MailProvider, token: string, sender: string, message: { to: string; subject: string; body: string }) {
  if (provider === 'manual') return sendManualMail(token, message.to, message.subject, message.body);
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

/** Persist read state in the actual mailbox; the client only updates after this returns. */
export async function markMailRead(provider: MailProvider, token: string, id: string) {
  if (provider === 'manual') return markManualRead(token, id);
  if (provider === 'gmail') {
    await providerFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(id) + '/modify',
      { method: 'POST', headers: headers(token), body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) });
  } else {
    await providerFetch('https://graph.microsoft.com/v1.0/me/messages/' + encodeURIComponent(id),
      { method: 'PATCH', headers: headers(token), body: JSON.stringify({ isRead: true }) });
  }
}

export async function replyToMail(provider: MailProvider, token: string, sender: string, id: string, body: string) {
  if (provider === 'manual') return replyManualMail(token, id, body);
  if (provider === 'outlook') {
    // Reply on the source message, not a user-supplied destination or subject.
    await providerFetch('https://graph.microsoft.com/v1.0/me/messages/' + encodeURIComponent(id) + '/reply',
      { method: 'POST', headers: headers(token), body: JSON.stringify({ comment: body }) });
    return;
  }
  const originalResponse = await providerFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' +
    encodeURIComponent(id) + '?format=full', { headers: headers(token) });
  const original = await originalResponse.json() as GmailMessage;
  const fields = original.payload?.headers ?? [];
  const field = (name: string) => fields.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
  const recipientRaw = field('Reply-To') || field('From');
  const extracted = /<([^<>\r\n]+)>/.exec(recipientRaw)?.[1] ?? recipientRaw.trim();
  const email = /^[^\s@<>\r\n,;]+@[^\s@<>\r\n,;]+\.[^\s@<>\r\n,;]+$/.test(extracted) ? extracted : '';
  if (!email || !original.threadId) throw Error('MAIL_PROVIDER_UNAVAILABLE');
  const originalSubject = field('Subject').replace(/[\r\n]/g, ' ').slice(0, 190);
  const subject = /^re:/i.test(originalSubject) ? originalSubject : 'Re: ' + originalSubject;
  const messageId = field('Message-ID');
  // Only RFC822 Message-IDs may enter structural reply headers.
  const validMessageId = /^<[^<>\r\n]{1,320}>$/.test(messageId) ? messageId : '';
  const references = field('References').match(/<[^<>\r\n]{1,320}>/g)?.slice(-20) ?? [];
  if (validMessageId) references.push(validMessageId);
  if (!validMessageId) throw Error('MAIL_PROVIDER_UNAVAILABLE');
  if (/[\r\n]/.test(sender)) throw Error('MAIL_PROVIDER_UNAVAILABLE');
  const raw = [
    'From: ' + sender, 'To: ' + email,
    'Subject: =?UTF-8?B?' + Buffer.from(subject).toString('base64') + '?=',
    'In-Reply-To: ' + validMessageId,
    'References: ' + [...new Set(references)].join(' '),
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64', '',
    Buffer.from(body).toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '',
  ].join('\r\n');
  await providerFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    { method: 'POST', headers: headers(token),
      body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url'), threadId: original.threadId }) });
}


/**
 * Move selected messages to recoverable folders. No permanent deletion.
 * Gmail supports batchModify; Microsoft Graph requires one move per message.
 * Partial Graph failures are returned explicitly so the UI can keep failures selected.
 */
export async function moveMailMessages(
  provider: MailProvider, token: string, ids: string[], destination: 'trash' | 'spam',
): Promise<{ moved: string[]; failed: string[] }> {
  if (provider === 'manual') return moveManualMessages(token, ids, destination);
  if (provider === 'gmail') {
    const label = destination === 'trash' ? 'TRASH' : 'SPAM';
    await providerFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify', {
      method: 'POST', headers: headers(token),
      body: JSON.stringify({
        ids, addLabelIds: [label],
        removeLabelIds: destination === 'trash' ? ['INBOX', 'SPAM'] : ['INBOX', 'TRASH'],
      }),
    });
    return { moved: ids, failed: [] };
  }
  const folder = destination === 'trash' ? 'deleteditems' : 'junkemail';
  const moved: string[] = [], failed: string[] = [];
  // Keep the provider call fan-out small; do not leak provider errors or tokens.
  for (let i = 0; i < ids.length; i += 4) {
    const results = await Promise.all(ids.slice(i, i + 4).map(async id => {
      try {
        await providerFetch('https://graph.microsoft.com/v1.0/me/messages/' + encodeURIComponent(id) + '/move', {
          method: 'POST', headers: headers(token),
          body: JSON.stringify({ destinationId: folder }),
        });
        return { id, ok: true };
      } catch { return { id, ok: false }; }
    }));
    for (const result of results) (result.ok ? moved : failed).push(result.id);
  }
  return { moved, failed };
}
