/**
 * Password/app-password IMAP + SMTP for user-controlled mail domains.
 * Not an OAuth replacement for Microsoft 365/Outlook.com.
 * No plaintext credentials are returned to browser, logged, or persisted.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';

export type ManualMailSettings = {
  email: string;
  imapHost: string; imapPort: number;
  smtpHost: string; smtpPort: number;
  username: string; password: string;
  smtpUsername?: string; smtpPassword?: string;
};
type Folder = 'inbox' | 'sent' | 'spam' | 'trash';
type MailSummary = { id: string; from: string; to: string; subject: string; preview: string; date: string; unread: boolean; starred: boolean; body?: string; html?: string };

const hostname = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const emailPattern = /^[^\s@<>\r\n,;]+@[^\s@<>\r\n,;]+\.[^\s@<>\r\n,;]+$/;
function publicAddress(ip: string) {
  if (isIP(ip) === 4) {
    const a = ip.split('.').map(Number);
    return a[0] > 0 && a[0] < 224 && a[0] !== 10 && a[0] !== 127 &&
      a[0] !== 169 && a[0] !== 100 && a[0] !== 192 && a[0] !== 198 &&
      a[0] !== 203 && !(a[0] === 172 && a[1] >= 16 && a[1] <= 31);
  }
  // Permit only routable global unicast v6, excluding documentation prefix.
  return isIP(ip) === 6 && /^[23][0-9a-f]{0,3}:/i.test(ip) && !ip.toLowerCase().startsWith('2001:db8:');
}
async function remoteAddress(host: string) {
  if (!hostname.test(host) || /(localhost|internal|local|test|invalid|example)$/i.test(host.split('.').at(-1) ?? '')) throw Error('MAIL_MANUAL_HOST');
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => !publicAddress(entry.address))) throw Error('MAIL_MANUAL_HOST');
  return addresses[0].address;
}
export function validateManualMailSettings(value: unknown): ManualMailSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('MAIL_MANUAL_INVALID');
  const v = value as Record<string, unknown>;
  const exact = ['email','imapHost','imapPort','smtpHost','smtpPort','username','password','smtpUsername','smtpPassword'];
  if (Object.keys(v).some(key => !exact.includes(key))) throw Error('MAIL_MANUAL_INVALID');
  const email = String(v.email ?? '').trim().toLowerCase();
  const imapHost = String(v.imapHost ?? '').trim().toLowerCase(), smtpHost = String(v.smtpHost ?? '').trim().toLowerCase();
  const username = String(v.username ?? '').trim(), password = v.password;
  const smtpUsername = typeof v.smtpUsername === 'string' ? v.smtpUsername.trim() : '';
  const smtpPassword = v.smtpPassword;
  const imapPort = Number(v.imapPort), smtpPort = Number(v.smtpPort);
  if (!emailPattern.test(email) || email.length > 320 || !hostname.test(imapHost) || !hostname.test(smtpHost) ||
      !username || username.length > 320 || typeof password !== 'string' || !password || password.length > 1024 ||
      (smtpUsername && smtpUsername.length > 320) || (smtpPassword !== undefined && (typeof smtpPassword !== 'string' || smtpPassword.length > 1024)) ||
      imapPort !== 993 || ![465, 587, 2525].includes(smtpPort)) throw Error('MAIL_MANUAL_INVALID');
  return { email, imapHost, imapPort, smtpHost, smtpPort, username, password,
    ...(smtpUsername ? { smtpUsername } : {}), ...(smtpPassword ? { smtpPassword } : {}) };
}
export async function validateManualHosts(config: ManualMailSettings) {
  await Promise.all([remoteAddress(config.imapHost), remoteAddress(config.smtpHost)]);
}
function configFromSecret(raw: string) {
  return validateManualMailSettings(JSON.parse(raw) as unknown);
}
async function connectedImap<T>(raw: string, action: (client: ImapFlow) => Promise<T>): Promise<T> {
  const conf = configFromSecret(raw);
  const host = await remoteAddress(conf.imapHost);
  const client = new ImapFlow({
    host, port: conf.imapPort, secure: true, auth: { user: conf.username, pass: conf.password },
    tls: { servername: conf.imapHost, rejectUnauthorized: true },
    logger: false, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  try {
    await client.connect();
    return await action(client);
  } finally {
    try { await client.logout(); } catch { /* Do not hide the original error */ }
  }
}
async function transport(raw: string) {
  const conf = configFromSecret(raw);
  const host = await remoteAddress(conf.smtpHost);
  return { conf, client: nodemailer.createTransport({
    host, port: conf.smtpPort, secure: conf.smtpPort === 465, requireTLS: conf.smtpPort !== 465,
    tls: { servername: conf.smtpHost, rejectUnauthorized: true },
    auth: { user: conf.smtpUsername || conf.username, pass: conf.smtpPassword || conf.password },
    connectionTimeout: 12_000, greetingTimeout: 10_000, socketTimeout: 12_000,
    pool: false,
  } as any) };
}
type Entry = { path: string; specialUse?: string };
async function resolveMailbox(client: ImapFlow, folder: Folder): Promise<string | null> {
  const all = await client.list() as Entry[];
  const targetSpecial = ({ inbox: '', sent: '\\Sent', spam: '\\Junk', trash: '\\Trash' } as const)[folder];
  const known = ({ inbox: ['INBOX'], sent: ['Sent', 'Sent Items', 'INBOX.Sent'],
    spam: ['Spam', 'Junk', 'Junk Email', 'INBOX.Spam'],
    trash: ['Trash', 'Deleted Items', 'Deleted Messages', 'INBOX.Trash'] } as const)[folder];
  const match = folder === 'inbox' ? all.find(row => row.path.toUpperCase() === 'INBOX')
    : all.find(row => row.specialUse === targetSpecial)
      ?? all.find(row => known.some(name => name.toLowerCase() === row.path.toLowerCase()));
  return match?.path ?? null;
}
function encodeId(path: string, uid: number) {
  return Buffer.from(JSON.stringify([path, uid]), 'utf8').toString('base64url');
}
function decodeId(id: string): { path: string; uid: number } {
  if (id.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(id)) throw Error('MAIL_MANUAL_ID');
  const parts = JSON.parse(Buffer.from(id, 'base64url').toString('utf8')) as unknown;
  if (!Array.isArray(parts) || parts.length !== 2 || typeof parts[0] !== 'string' ||
      !parts[0] || parts[0].length > 300 || !Number.isSafeInteger(parts[1]) || Number(parts[1]) < 1) throw Error('MAIL_MANUAL_ID');
  return { path: parts[0], uid: Number(parts[1]) };
}
async function openVerified(client: ImapFlow, path: string) {
  const all = await client.list();
  if (!all.some(row => row.path === path)) throw Error('MAIL_MANUAL_ID');
  return client.getMailboxLock(path);
}
const displayAddress = (input: { name?: string; address?: string }[] | undefined) =>
  (input ?? []).map(x => x.name ? x.name + ' <' + (x.address ?? '') + '>' : x.address ?? '').join(', ');
async function parsedMail(raw: Buffer, id: string, flags: Set<string>, date: Date | undefined): Promise<MailSummary> {
  const mail = await simpleParser(raw);
  let html = typeof mail.html === 'string' ? mail.html : '';
  let embedded = 0;
  for (const attachment of mail.attachments) {
    if (!attachment.cid || !/^image\/(?:png|jpeg|gif|webp)$/i.test(attachment.contentType) ||
        attachment.content.length > 750_000 || embedded + attachment.content.length > 2_000_000) continue;
    embedded += attachment.content.length;
    const cid = attachment.cid.replace(/^<|>$/g, '');
    html = html.replaceAll('cid:' + cid, 'data:' + attachment.contentType + ';base64,' + attachment.content.toString('base64'));
  }
  const from = mail.from?.text ?? '', to = mail.to ? (Array.isArray(mail.to) ? mail.to.map(x=>x.text).join(', ') : mail.to.text) : '';
  return { id, from, to, subject: mail.subject ?? '', preview: (mail.text ?? '').slice(0, 300),
    date: (date ?? mail.date ?? new Date(0)).toISOString(), unread: !flags.has('\\Seen'), starred: flags.has('\\Flagged'),
    body: (mail.text ?? '').slice(0, 200_000), ...(html ? { html: html.slice(0, 500_000) } : {}) };
}
export async function listManualMail(raw: string, folder: Folder, filter: 'all'|'unread'|'starred', page: string) {
  return connectedImap(raw, async client => {
    const path = await resolveMailbox(client, folder);
    if (!path) return { messages: [] as MailSummary[], nextPage: null as string|null };
    const lock = await client.getMailboxLock(path);
    try {
      const total = client.mailbox ? client.mailbox.exists : 0;
      const offset = page ? Number(page) : 0;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw Error('MAIL_MANUAL_PAGE');
      const upper = total - offset;
      if (upper < 1) return { messages: [] as MailSummary[], nextPage: null as string|null };
      const lower = Math.max(1, upper - 49);
      const items = await client.fetchAll(lower + ':' + upper, { uid: true, envelope: true, flags: true, internalDate: true });
      const messages = items.reverse().filter(m => filter === 'all' ||
        (filter === 'unread' ? !m.flags?.has('\\Seen') : Boolean(m.flags?.has('\\Flagged'))))
        .slice(0, 20).map(m => ({
          id: encodeId(path, m.uid), from: displayAddress(m.envelope?.from),
          to: displayAddress(m.envelope?.to), subject: m.envelope?.subject ?? '', preview: '',
          date: new Date(m.internalDate ?? 0).toISOString(), unread: !m.flags?.has('\\Seen'),
          starred: Boolean(m.flags?.has('\\Flagged')),
        }));
      return { messages, nextPage: lower > 1 ? String(offset + 50) : null };
    } finally { lock.release(); }
  });
}
export async function getManualMessage(raw: string, id: string): Promise<MailSummary> {
  const { path, uid } = decodeId(id);
  return connectedImap(raw, async client => {
    const lock = await openVerified(client, path);
    try {
      const item = await client.fetchOne(uid, { source: { start: 0, maxLength: 2_000_000 }, flags: true, internalDate: true }, { uid: true });
      if (!item || !item.source) throw Error('MAIL_MANUAL_ID');
      return parsedMail(item.source, id, item.flags ?? new Set(), item.internalDate ? new Date(item.internalDate) : undefined);
    } finally { lock.release(); }
  });
}
export async function markManualRead(raw: string, id: string) {
  const { path, uid } = decodeId(id);
  return connectedImap(raw, async client => {
    const lock = await openVerified(client, path);
    try { await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }); }
    finally { lock.release(); }
  });
}
export async function moveManualMessages(raw: string, ids: string[], destination: 'trash'|'spam') {
  return connectedImap(raw, async client => {
    const folderPath = await resolveMailbox(client, destination);
    if (!folderPath) throw Error('MAIL_MANUAL_FOLDER');
    const moved: string[] = [], failed: string[] = [];
    const groups = new Map<string, { uid: number; id: string }[]>();
    for (const id of ids) {
      const { path, uid } = decodeId(id);
      if (!groups.has(path)) groups.set(path, []);
      groups.get(path)!.push({uid,id});
    }
    for (const [path, entries] of groups) {
      try {
        const lock = await openVerified(client, path);
        try {
          for (const entry of entries) {
            try {
              if (path === folderPath) { moved.push(entry.id); continue; }
              const ok = await client.messageMove(entry.uid, folderPath, { uid: true });
              if (ok === false) failed.push(entry.id);
              else moved.push(entry.id);
            } catch { failed.push(entry.id); }
          }
        } finally { lock.release(); }
      } catch { failed.push(...entries.map(row => row.id)); }
    }
    return { moved, failed };
  });
}
export async function sendManualMail(raw: string, to: string, subject: string, body: string) {
  const {conf, client} = await transport(raw);
  try { await client.sendMail({ from: conf.email, to, subject, text: body }); }
  finally { client.close(); }
}
export async function replyManualMail(raw: string, id: string, body: string) {
  const { path, uid } = decodeId(id);
  const original = await connectedImap(raw, async client => {
    const lock = await openVerified(client, path);
    try {
      const item = await client.fetchOne(uid, { source: {start: 0,maxLength: 2_000_000} }, { uid:true });
      if (!item || !item.source) throw Error('MAIL_MANUAL_ID');
      return simpleParser(item.source);
    } finally { lock.release(); }
  });
  const conf = configFromSecret(raw);
  const recipient = original.replyTo?.value?.[0]?.address ?? original.from?.value?.[0]?.address;
  if (!recipient || !emailPattern.test(recipient)) throw Error('MAIL_MANUAL_RECIPIENT');
  const references = Array.isArray(original.references) ? original.references : original.references ? [original.references] : [];
  const {client} = await transport(raw);
  try {
    await client.sendMail({ from: conf.email, to: recipient,
      subject: /^re:/i.test(original.subject ?? '') ? original.subject : 'Re: ' + (original.subject ?? ''),
      inReplyTo: original.messageId, references: [...references, original.messageId].filter(Boolean) as string[],
      text: body });
  } finally { client.close(); }
}
