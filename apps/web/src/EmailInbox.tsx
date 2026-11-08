import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUpRight, Inbox, Link2, Mail, Plus, RefreshCw, Reply, Search, Send, ShieldAlert, ShieldCheck, Star, Trash2, Unplug, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useUorquiPreferences } from './UorquiPreferences';
import { WorkspaceContentLoading } from './ui-kit/WorkspaceContentLoading';
import { clearReadPush } from './readPushNotifications';

type Provider = 'gmail' | 'outlook' | 'manual';
type MailAccount = { id: string; provider: Provider; email: string };
type MailFolder = 'inbox' | 'sent' | 'spam' | 'trash';
type Message = { id: string; from: string; to: string; subject: string; preview: string; date: string; unread: boolean; starred: boolean; body?: string; html?: string };
type Accounts = { accounts: MailAccount[]; providers: { id: Provider; configured: boolean }[]; webOrigin?: string };
type InboxMessage = Message & { accountId: string };
const ALL_ACCOUNTS = '__all__';
const mailKey = (accountId: string, messageId: string) => JSON.stringify([accountId, messageId]);
const newestFirst = (a: InboxMessage, b: InboxMessage) =>
  (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0);

function mailOAuthFailureMessage(reason: string, pt: boolean, provider: 'gmail'|'outlook'): string {
  const microsoft=provider==='outlook';
  switch (reason) {
    case 'session': return pt
      ? 'Sua sessão não foi reconhecida no retorno do '+(microsoft?'Microsoft':'Google')+'. Entre no domínio oficial do Uorqui e tente conectar novamente.'
      : 'Uorqui session missing after returning from '+(microsoft?'Microsoft':'Google')+'. Sign in on the official domain and retry.';
    case 'state': return pt
      ? 'A autorização expirou ou não corresponde à sessão atual. Inicie uma nova conexão.'
      : 'The authorization expired or did not match your current session. Start a new connection.';
    case 'denied': return pt
      ? (microsoft?'A Microsoft não concedeu autorização. Confira as permissões delegadas do Graph e, se for uma conta corporativa, o consentimento do administrador.':'O Google não autorizou o acesso. Confira os usuários de teste e as permissões no Google Cloud.')
      : (microsoft?'Microsoft did not grant access. Check delegated Graph permissions and, for work accounts, administrator consent.':'Google did not grant access. Check test users and permissions in Google Cloud.');
    case 'token': return pt
      ? 'Não foi possível trocar o código OAuth do '+(microsoft?'Microsoft Entra':'Google Cloud')+'. Confira Client ID, Client Secret e a URI exata de redirecionamento.'
      : 'Could not exchange the '+(microsoft?'Microsoft Entra':'Google Cloud')+' OAuth code. Check Client ID, Client Secret and exact redirect URI.';
    case 'mailbox': return pt
      ? (microsoft?'A Microsoft autorizou o aplicativo, mas não liberou a caixa de correio. Confira Mail.ReadWrite, Mail.Send, User.Read e a licença de e-mail do usuário.':'O Google autorizou o aplicativo, mas não liberou o Gmail. Confirme que a Gmail API está ativada e os escopos foram concedidos.')
      : (microsoft?'Microsoft authorized the app, but mailbox access failed. Check Mail.ReadWrite, Mail.Send, User.Read and mailbox provisioning.':'Google authorized the app, but Gmail mailbox access failed. Enable the Gmail API and check permissions.');
    case 'storage': return pt
      ? 'A autorização foi concedida, mas não foi possível salvar a conexão. Confira os logs da API.'
      : 'Authorization was granted, but the connection could not be saved. Check API logs.';
    case 'invalid_return': return pt
      ? 'O retorno do provedor estava incompleto. Abra o Uorqui e inicie uma nova conexão.'
      : 'The provider callback was incomplete. Open Uorqui and reconnect.';
    default: return pt ? 'Não foi possível conectar a conta. Tente novamente.' : 'Could not connect your account. Please try again.';
  }
}

async function requestMail<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/v1/mail/' + path, { credentials: 'same-origin', cache: 'no-store', ...init });
  const data = await response.json().catch(() => null) as T & { error?: string };
  if (!response.ok || !data) throw Error(data?.error ?? 'MAIL_UNAVAILABLE');
  return data;
}

export default function EmailInbox({ onMobileOpenChange, requestedMessage }: {
  onMobileOpenChange: (open: boolean) => void;
  requestedMessage?: { accountId: string; messageId: string; nonce: number } | null;
}) {
  const { locale } = useUorquiPreferences(), pt = locale === 'pt-BR';
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [providers, setProviders] = useState<Accounts['providers']>([]);
  const [webOrigin, setWebOrigin] = useState('');
  const [accountId, setAccountId] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountRefresh, setAccountRefresh] = useState(0);
  const [folder, setFolder] = useState<MailFolder>('inbox');
  const [filter, setFilter] = useState<'all' | 'unread' | 'starred'>('all');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selected, setSelected] = useState<InboxMessage | null>(null);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [unifiedCursors, setUnifiedCursors] = useState<Record<string, string>>({});
  const [composeAccountId, setComposeAccountId] = useState('');
  const [page, setPage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('mail');
    return value === 'connected' ? 'connected' : value === 'failed' ? 'failed' : '';
  });
  const [mailFailureReason] = useState(() => new URLSearchParams(window.location.search).get('mail_reason') ?? '');
  const [mailFailureProvider] = useState<'gmail'|'outlook'>(() =>
    new URLSearchParams(window.location.search).get('mail_provider')==='outlook'?'outlook':'gmail');
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [compose, setCompose] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [expandedImage,setExpandedImage]=useState<{src:string;alt:string}|null>(null);
  const mailFrameCleanup=useRef<(()=>void)|null>(null);
  const [readyFrame,setReadyFrame]=useState<{accountId:string;messageId:string;html:string}|null>(null);
  useEffect(()=>()=>{mailFrameCleanup.current?.();mailFrameCleanup.current=null;},[]);
  const [replyError, setReplyError] = useState('');
  // Remote HTTPS images are loaded by default, as requested. The iframe still
  // blocks scripts, forms, access to Uorqui cookies and parent DOM.
  const [connectPicker, setConnectPicker] = useState(false);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [connectError,setConnectError]=useState('');
  const mailDialogRef=useRef<HTMLDivElement|null>(null);
  const mailDialogScrollRef=useRef<HTMLDivElement|null>(null);
  const mailDialogReturnFocus=useRef<HTMLElement|null>(null);
  const mailDialogTitleId='uorqui-mail-configuration-heading';
  function openMailConfiguration(){
    mailDialogReturnFocus.current=document.activeElement as HTMLElement|null;
    setConnectError('');
    setManualFormOpen(false);
    setConnectPicker(true);
  }
  function closeMailConfiguration(){
    if(savingManual||connecting)return;
    setConnectPicker(false);
    setManualFormOpen(false);
    setConnectError('');
    setManualDraft(previous=>({...previous,password:'',smtpPassword:''}));
    window.requestAnimationFrame(()=>mailDialogReturnFocus.current?.focus());
  }
  useEffect(()=>{
    if(!connectPicker)return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    mailDialogRef.current?.focus();
    return()=>{document.body.style.overflow=previousOverflow;};
  },[connectPicker]);
  useEffect(()=>{
    if(connectPicker&&manualFormOpen)mailDialogScrollRef.current?.scrollTo({top:0});
  },[connectPicker,manualFormOpen]);
  function modalKeyDown(event:ReactKeyboardEvent<HTMLDivElement>){
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();
      closeMailConfiguration();
      return;
    }
    if(event.key!=='Tab')return;
    const root=mailDialogRef.current;
    if(!root)return;
    const focusable=Array.from(root.querySelectorAll<HTMLElement>(
      'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])'
    )).filter(node=>node.getClientRects().length>0);
    if(!focusable.length){event.preventDefault();root.focus();return;}
    const first=focusable[0],last=focusable[focusable.length-1],current=document.activeElement;
    if(event.shiftKey&&(current===first||current===root)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(current===last||current===root)){event.preventDefault();first.focus();}
  }
  const [savingManual, setSavingManual] = useState(false);
  const [manualDraft, setManualDraft] = useState({
    email: '', imapHost: '', imapPort: 993,
    smtpHost: '', smtpPort: 587, username: '', password: '',
    smtpUsername: '', smtpPassword: '',
  });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moving, setMoving] = useState(false);
  const [sending, setSending] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [draft, setDraft] = useState({ to: '', subject: '', body: '' });
  const [sendError, setSendError] = useState('');
  const detailAbort = useRef<AbortController | null>(null);
  const openedMailLink = useRef<number | null>(null);
  const account = accounts.find(item => item.id === accountId);
  const readingAccount = accounts.find(item => item.id === selected?.accountId);
  const composingAccount = accounts.find(item => item.id === composeAccountId);
  const hasMailAccounts = accounts.length > 0;
  const open = Boolean(selected || compose);
  useEffect(() => { onMobileOpenChange(open); return () => onMobileOpenChange(false); }, [open, onMobileOpenChange]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('mail') || url.searchParams.has('mail_reason') || url.searchParams.has('mail_provider')) {
      url.searchParams.delete('mail'); url.searchParams.delete('mail_reason'); url.searchParams.delete('mail_provider');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
    return () => detailAbort.current?.abort();
  }, []);

  const explainError = useCallback((error: unknown) => error instanceof Error && error.message === 'MAIL_RECONNECT'
    ? (pt ? 'Sua autorização expirou ou não inclui as permissões necessárias. Conecte a conta novamente.' : 'Your authorization expired or is missing permissions. Reconnect your account.')
    : (pt ? 'Não foi possível acessar o email. Tente novamente.' : 'Could not access email. Please try again.'), [pt]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingAccounts(true); setError('');
    void requestMail<Accounts>('accounts', { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setAccounts(data.accounts); setProviders(data.providers); setWebOrigin(data.webOrigin ?? '');
      setAccountId(previous => previous === ALL_ACCOUNTS && data.accounts.length ? previous
         : data.accounts.some(item => item.id === previous) ? previous : data.accounts.length > 1 ? ALL_ACCOUNTS : data.accounts[0]?.id ?? '');
       setComposeAccountId(previous => data.accounts.some(item => item.id === previous) ? previous : data.accounts[0]?.id ?? '');
    }).catch(error => { if (!controller.signal.aborted) setError(explainError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingAccounts(false); });
    return () => controller.abort();
  }, [accountRefresh, explainError]);

  useEffect(() => {
    if (!accountId || !accounts.length) { setMessages([]); setNextPage(null); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    const unified = accountId === ALL_ACCOUNTS;
    // Each mailbox keeps an independent cursor: loading more cannot skip a provider's messages.
    const targets = unified ? (page ? accounts.filter(item => unifiedCursors[item.id]) : accounts)
      : accounts.filter(item => item.id === accountId);
    const load = async () => {
      const responses = await Promise.allSettled(targets.map(async item => {
        const cursor = unified ? (page ? unifiedCursors[item.id] : '') : page;
        const params = new URLSearchParams({ folder, filter, ...(cursor ? { page: cursor } : {}) });
        const result = await requestMail<{ messages: Message[]; nextPage: string | null }>(
          'accounts/' + item.id + '/messages?' + params, { signal: controller.signal });
        return { accountId: item.id, ...result };
      }));
      if (controller.signal.aborted) return;
      const received: InboxMessage[] = [];
      const cursors: Record<string, string> = page && unified ? { ...unifiedCursors } : {};
      let failures = 0;
      responses.forEach((result, index) => {
        if (result.status === 'rejected') { failures++; return; }
        const { accountId: mailboxId, messages: rows, nextPage: cursor } = result.value;
        received.push(...rows.map(item => ({ ...item, accountId: mailboxId })));
        if (unified) {
          if (cursor) cursors[mailboxId] = cursor;
          else delete cursors[mailboxId];
        }
        if (!unified) setNextPage(cursor);
      });
      if (unified) {
        setUnifiedCursors(cursors);
        setNextPage(Object.keys(cursors).length ? '__next__' : null);
      }
      setMessages(previous => {
        const combined = page ? [...previous, ...received] : received;
        const distinct = new Map(combined.map(item => [mailKey(item.accountId, item.id), item]));
        return [...distinct.values()].sort(newestFirst);
      });
      if (failures) setError(failures === targets.length ? explainError(new Error('MAIL_UNAVAILABLE'))
        : (pt ? `Não foi possível carregar ${failures} conta(s). As demais continuam disponíveis. Tente novamente.`
          : `Could not load ${failures} account(s). Other mailboxes remain available. Please retry.`));
    };
    void load().finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // Cursors are read only when page changes, so a cursor update must not retrigger fetching.
  }, [accountId, accounts, folder, filter, page, refresh, explainError, pt]);

  function closeDetail() { mailFrameCleanup.current?.();mailFrameCleanup.current=null;setReadyFrame(null);setExpandedImage(null);detailAbort.current?.abort(); setSelected(null); setCompose(false); setReplying(false); setReplyBody(''); setReplyError(''); setLoadingBody(false); }
  function clearSelection() { setSelectionMode(false); setSelectedIds([]); }
  function resetList() { closeDetail(); clearSelection(); setMessages([]); setPage(''); setUnifiedCursors({}); setNextPage(null); setQuery(''); }
  async function connect(provider: 'gmail'|'outlook') {
    if (connecting) return;
    setConnecting(provider); setConnectError('');
    try {
      // OAuth callbacks use WEB_ORIGIN. Different hosts do not share session cookies.
      if (webOrigin && window.location.origin !== webOrigin)
        throw Error('MAIL_ORIGIN_MISMATCH');
      const data = await requestMail<{ url: string }>('oauth/' + provider, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || !['accounts.google.com', 'login.microsoftonline.com'].includes(url.hostname)) throw Error('MAIL_UNAVAILABLE');
      window.location.assign(url.toString());
    } catch (error) {
      setConnectError(error instanceof Error && error.message === 'MAIL_ORIGIN_MISMATCH'
        ? (pt ? 'Abra ' + webOrigin + ', faça login e conecte seu email por esse endereço. A sessão de outro domínio não é compartilhada.'
          : 'Open ' + webOrigin + ', sign in and connect your email there. Sessions cannot be shared between domains.')
        : explainError(error));
      setConnecting(null);
    }
  }
  async function submitManual(event: FormEvent) {
    event.preventDefault();
    if (savingManual || connecting) return;
    setSavingManual(true); setConnectError('');
    try {
      await requestMail('manual', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(manualDraft) });
      setManualDraft(previous => ({...previous, password: '', smtpPassword: ''}));
      setManualFormOpen(false); setConnectPicker(false); setConnectError('');setNotice('connected');
      setAccountRefresh(value => value + 1);
      window.dispatchEvent(new Event('uorqui:mail-unread-refresh'));
    } catch (error) {
      setConnectError(error instanceof Error && error.message === 'MAIL_MANUAL_INVALID'
        ? (pt ? 'Confira os dados: IMAP TLS usa porta 993; SMTP TLS usa 465, 587 ou 2525.' : 'Check your settings: IMAP TLS uses port 993; SMTP TLS uses 465, 587 or 2525.')
        : (pt ? 'Não foi possível verificar o domínio do servidor ou salvar a conta. Confira os endereços e tente novamente.'
          : 'Could not validate server hostname or save the mailbox. Check your settings and try again.'));
    } finally { setSavingManual(false); }
  }
  async function disconnect() {
    if (!account || disconnecting || !window.confirm(pt ? 'Desconectar ' + account.email + '? Seus emails continuarão no provedor.' : 'Disconnect ' + account.email + '? Your email will remain with the provider.')) return;
    setDisconnecting(true); setError('');
    try { await requestMail('accounts/' + account.id, { method: 'DELETE' }); resetList(); setAccountId(''); setAccounts([]); setAccountRefresh(value => value + 1); window.dispatchEvent(new Event('uorqui:mail-unread-refresh')); }
    catch (error) { setError(explainError(error)); }
    finally { setDisconnecting(false); }
  }
  async function showMessage(message: InboxMessage, chosenAccount = message.accountId) {
    mailFrameCleanup.current?.();mailFrameCleanup.current=null;setReadyFrame(null);
    setExpandedImage(null);
    detailAbort.current?.abort();
    const controller = new AbortController(); detailAbort.current = controller;
    setCompose(false); setReplying(false); setReplyBody('');
    setSelected(message); setLoadingBody(true); setError('');
    try {
      const data = await requestMail<Message>('accounts/' + chosenAccount + '/message-detail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: message.id }), signal: controller.signal });
      if (controller.signal.aborted) return;
      setSelected({ ...data, accountId: chosenAccount });
      if (data.unread) {
        try {
          await requestMail('accounts/' + chosenAccount + '/message-read',
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: message.id }) });
          if (controller.signal.aborted) return;
          setMessages(old => old.map(row => row.accountId === chosenAccount && row.id === data.id ? { ...row, unread: false } : row));
          setSelected(old => old?.accountId === chosenAccount && old.id === data.id ? { ...old, unread: false } : old);
          window.dispatchEvent(new CustomEvent('uorqui:mail-unread-delta',{detail:{amount:1}}));
          clearReadPush({kind:'mail',accountId:chosenAccount,messageId:data.id});
        } catch {
          if (!controller.signal.aborted)
            setError(pt ? 'Mensagem aberta, mas não foi possível marcá-la como lida. Reconecte a conta para conceder permissão de edição.'
              : 'Message opened, but it could not be marked as read. Reconnect the account to grant write access.');
        }
      } else {
        // The provider may already have marked it read on another device.
        clearReadPush({kind:'mail',accountId:chosenAccount,messageId:data.id});
      }
    } catch (error) { if (!controller.signal.aborted) setError(explainError(error)); }
    finally { if (!controller.signal.aborted) setLoadingBody(false); }
  }
  // Push clicks may arrive while the inbox is closed, or switch between linked accounts.
  // Open the actual provider message by ID; do not depend on the first page of the inbox.
  useEffect(() => {
    if (!requestedMessage || loadingAccounts || openedMailLink.current === requestedMessage.nonce) return;
    openedMailLink.current = requestedMessage.nonce;
    if (!accounts.some(item => item.id === requestedMessage.accountId)) {
      setError(pt ? 'A conta deste e-mail não está conectada.' : 'This email account is not connected.');
      return;
    }
    resetList();
    setFolder('inbox'); setFilter('all'); setAccountId(requestedMessage.accountId);
    void showMessage({
      id: requestedMessage.messageId, accountId: requestedMessage.accountId, from:'', to:'', subject:'', preview:'',
      date:new Date().toISOString(), unread:false, starred:false,
    },requestedMessage.accountId);
  }, [requestedMessage?.nonce, loadingAccounts, accounts]);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (sending || !composingAccount) return;
    setSending(true); setSendError('');
    try {
      await requestMail('accounts/' + composingAccount.id + '/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      setDraft({ to: '', subject: '', body: '' }); setCompose(false); setNotice('sent'); setPage(''); setRefresh(value => value + 1);
    } catch { setSendError(pt ? 'Não foi possível confirmar o envio. Verifique a pasta Enviados antes de tentar novamente.' : 'Could not confirm delivery. Check Sent before trying again.'); }
    finally { setSending(false); }
  }
  async function submitReply(event: FormEvent) {
    event.preventDefault();
    if (!selected || !readingAccount || !replyBody.trim() || replySending) return;
    setReplySending(true); setReplyError('');
    try {
      await requestMail('accounts/' + readingAccount.id + '/message-reply',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: selected.id, body: replyBody.trim() }) });
      setReplying(false); setReplyBody(''); setNotice('sent'); setPage(''); setRefresh(value => value + 1);
    } catch (error) {
      setReplyError(error instanceof Error && error.message === 'MAIL_RECONNECT'
        ? (pt ? 'Reconecte sua conta para autorizar o envio.' : 'Reconnect your account to authorize sending.')
        : (pt ? 'Não foi possível confirmar a resposta. Confira Enviados antes de tentar novamente.'
          : 'Reply could not be confirmed. Check Sent before trying again.'));
    } finally { setReplySending(false); }
  }
  function toggleSelected(id: string) {
    setSelectedIds(previous => previous.includes(id)
      ? previous.filter(item => item !== id)
      : previous.length >= 100 ? previous : [...previous, id]);
  }
  async function moveSelected(destination: 'trash' | 'spam') {
    if (!account || selectedIds.length === 0 || moving) return;
    setMoving(true); setError('');
    const targetAccount = account.id;
    const ids = [...selectedIds];
    try {
      const result = await requestMail<{ moved: string[]; failed: string[] }>(
        'accounts/' + targetAccount + '/messages/move', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, destination }),
        });
      const moved = new Set(result.moved.filter(id => ids.includes(id)));
      const failed = ids.filter(id => !moved.has(id));
      if (moved.size) {
        if (folder === 'inbox') {
          const unreadMoved = messages.filter(message => message.unread && moved.has(message.id)).length;
          if (unreadMoved) window.dispatchEvent(new CustomEvent('uorqui:mail-unread-delta',{detail:{amount:unreadMoved}}));
        }
        setMessages(previous => previous.filter(message => !moved.has(message.id)));
        clearReadPush([...moved].map(messageId=>({kind:'mail' as const,accountId:targetAccount,messageId})));
        if (selected && moved.has(selected.id)) closeDetail();
      }
      setSelectedIds(failed);
      setSelectionMode(failed.length > 0);
      if (failed.length) {
        setError(pt
          ? `${moved.size} movidos, ${failed.length} não puderam ser movidos. Tente novamente.`
          : `${moved.size} moved, ${failed.length} could not be moved. Please retry.`);
      } else {
        setNotice(destination === 'trash' ? 'movedTrash' : 'movedSpam');
      }
      if (moved.size) { setPage(''); setNextPage(null); setRefresh(value => value + 1); }
    } catch (error) { setError(explainError(error)); }
    finally { setMoving(false); }
  }
  function startCompose() { setComposeAccountId(account?.id ?? composeAccountId ?? accounts[0]?.id ?? ''); mailFrameCleanup.current?.();mailFrameCleanup.current=null;setReadyFrame(null);detailAbort.current?.abort(); setSelected(null); setReplying(false); setCompose(true); setSendError(''); }
  const framedHtml = selected?.html ? [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="referrer" content="no-referrer">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\'; font-src data:; form-action \'none\'; base-uri \'none\'; object-src \'none\';">',
    '<style>html,body{margin:0;padding:0;overflow-wrap:anywhere}img{max-width:100%!important;height:auto!important;cursor:zoom-in!important}table{max-width:100%}a{overflow-wrap:anywhere}</style>',
    '</head><body>', selected.html, '</body></html>',
  ].join('') : '';
  const htmlFrameReady=Boolean(selected?.html&&readyFrame?.accountId===selected.accountId&&
    readyFrame?.messageId===selected.id&&readyFrame?.html===selected.html);
  const visible = messages.filter(message => (message.from + ' ' + message.subject + ' ' + message.preview).toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  const visibleIds = visible.map(message => message.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
  function toggleVisible() {
    setSelectedIds(previous => allVisibleSelected
      ? previous.filter(id => !visibleIds.includes(id))
      : [...new Set([...previous, ...visibleIds])].slice(0, 100));
  }
  function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString(locale, { day: 'numeric', month: 'short' }); }
  const connectButtons = <div className="flex flex-wrap gap-2">
    <Button type="button" variant="outline" disabled={!providers.some(item => item.id === 'gmail' && item.configured) || Boolean(connecting) || savingManual || loadingAccounts}
      onClick={() => void connect('gmail')} className="min-h-11 gap-2">
      {connecting === 'gmail' ? <Spinner className="size-4" /> : <Plus className="size-4" />} Gmail
    </Button>
    <Button type="button" variant="outline"
      title={!providers.some(item=>item.id==='outlook'&&item.configured)?
        (pt?'Aguardando credenciais Microsoft Entra no servidor':'Microsoft Entra credentials are not configured on the server'):undefined}
      disabled={!providers.some(item=>item.id==='outlook'&&item.configured)||Boolean(connecting)||savingManual||loadingAccounts}
      onClick={()=>void connect('outlook')} className="min-h-11 gap-2">
      {connecting==='outlook'?<Spinner className="size-4"/>:<Plus className="size-4"/>} Outlook
    </Button>
    <Button type="button" variant="outline" disabled={savingManual || Boolean(connecting)}
      onClick={() => {setConnectError('');setManualFormOpen(open => !open);}} className="min-h-11 gap-2">
      <Plus className="size-4" />{pt ? 'Servidor manual' : 'Manual server'}
    </Button>
  </div>;
  const manualForm = manualFormOpen && <form onSubmit={event => void submitManual(event)}
    className="space-y-3 rounded-lg border border-border bg-card p-3 text-xs">
    <h3 className="font-semibold">{pt ? 'Configuração IMAP / SMTP' : 'IMAP / SMTP setup'}</h3>
    <label className="block space-y-1"><span>{pt ? 'E-mail' : 'Email address'}</span>
      <Input type="email" autoComplete="email" required maxLength={320} value={manualDraft.email}
        onChange={event => setManualDraft(old => ({...old,email:event.target.value}))} placeholder="contato@seudominio.com" />
    </label>
    <label className="block space-y-1"><span>{pt ? 'Servidor IMAP (entrada)' : 'IMAP (incoming) host'}</span>
      <Input required maxLength={253} value={manualDraft.imapHost}
        onChange={event => setManualDraft(old => ({...old,imapHost:event.target.value}))} placeholder="imap.seudominio.com" />
    </label>
    <label className="block space-y-1"><span>{pt ? 'Porta IMAP (SSL/TLS)' : 'IMAP SSL/TLS port'}</span>
      <Input type="number" min="993" max="993" required value={manualDraft.imapPort}
        onChange={event => setManualDraft(old => ({...old,imapPort:Number(event.target.value)}))} />
    </label>
    <label className="block space-y-1"><span>{pt ? 'Servidor SMTP (saída)' : 'SMTP (outgoing) host'}</span>
      <Input required maxLength={253} value={manualDraft.smtpHost}
        onChange={event => setManualDraft(old => ({...old,smtpHost:event.target.value}))} placeholder="smtp.seudominio.com" />
    </label>
    <label className="block space-y-1"><span>{pt ? 'Porta SMTP (TLS)' : 'SMTP TLS port'}</span>
      <select required value={manualDraft.smtpPort}
        onChange={event => setManualDraft(old => ({...old,smtpPort:Number(event.target.value)}))}
        className="h-10 w-full rounded-md border border-input bg-background px-2">
        <option value={587}>587 (STARTTLS)</option><option value={465}>465 (SSL/TLS)</option>
        <option value={2525}>2525 (STARTTLS)</option>
      </select>
    </label>
    <label className="block space-y-1"><span>{pt ? 'Usuário IMAP' : 'IMAP username'}</span>
      <Input required maxLength={320} autoComplete="username" value={manualDraft.username}
        onChange={event => setManualDraft(old => ({...old,username:event.target.value}))} placeholder="contato@seudominio.com" />
    </label>
    <label className="block space-y-1"><span>{pt ? 'Senha do aplicativo ou do servidor' : 'App or server password'}</span>
      <Input type="password" required maxLength={1024} autoComplete="new-password" value={manualDraft.password}
        onChange={event => setManualDraft(old => ({...old,password:event.target.value}))} />
    </label>
    <label className="block space-y-1"><span>{pt ? 'Usuário SMTP (opcional)' : 'SMTP username (optional)'}</span>
      <Input maxLength={320} value={manualDraft.smtpUsername}
        onChange={event => setManualDraft(old => ({...old,smtpUsername:event.target.value}))} placeholder={pt ? 'Igual ao IMAP se vazio' : 'Same as IMAP if blank'} />
    </label>
    <label className="block space-y-1"><span>{pt ? 'Senha SMTP (opcional)' : 'SMTP password (optional)'}</span>
      <Input type="password" maxLength={1024} autoComplete="new-password" value={manualDraft.smtpPassword}
        onChange={event => setManualDraft(old => ({...old,smtpPassword:event.target.value}))} />
    </label>
    <p className="leading-5 text-muted-foreground">{pt
      ? 'Credenciais criptografadas no servidor. Outlook.com/Microsoft 365 exige OAuth2. Render gratuito bloqueia SMTP 465/587; o envio nessas portas pode falhar.'
      : 'Credentials encrypted on the server. Outlook.com/Microsoft 365 requires OAuth2. Free Render blocks SMTP 465/587, so sending may fail.'}</p>
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" disabled={savingManual} onClick={() => {setConnectError('');setManualFormOpen(false);}}>{pt ? 'Voltar' : 'Back'}</Button>
      <Button type="submit" disabled={savingManual}>{savingManual ? <Spinner className="size-4" /> : (pt ? 'Salvar conta' : 'Save account')}</Button>
    </div>
  </form>;

  return <div data-uorqui-email className="relative flex h-full min-h-0 min-w-0 overflow-hidden">
    <aside data-uorqui-workspace-surface className={cn('flex h-full min-h-0 w-full min-w-0 flex-col border-r border-border md:w-[340px] md:shrink-0 xl:w-[380px]', open && 'max-md:hidden')}>
      <header className="shrink-0 space-y-4 border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2"><h1 className="text-lg font-semibold tracking-tight">Email</h1>
          <div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={pt ? 'Atualizar emails' : 'Refresh email'} disabled={loading || loadingAccounts}
            onClick={() => { setPage(''); setRefresh(value => value + 1); setAccountRefresh(value => value + 1); }}><RefreshCw className="size-4" /></Button>
            <Button size="icon" variant="ghost" aria-label={pt ? 'Novo email' : 'New email'} disabled={!account} onClick={startCompose}><Plus className="size-4" /></Button></div>
        </div>
        {account && <>
          <div className="flex items-center gap-1">
            <select aria-label={pt ? 'Conta de email' : 'Email account'} value={accountId} disabled={sending || moving}
              onChange={event => {
                if (event.target.value === '__connect__') { openMailConfiguration();return; }
                resetList(); setAccountId(event.target.value);
              }} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm">
              {accounts.map(item => <option key={item.id} value={item.id}>{item.email}</option>)}
              <option value="__connect__">{pt ? '+ Conectar novo e-mail' : '+ Connect another email'}</option>
            </select>
            <Button size="icon" variant="ghost" aria-label={pt ? 'Desconectar conta' : 'Disconnect account'}
              disabled={disconnecting || sending || moving} onClick={() => void disconnect()}><Unplug className="size-4" /></Button>
          </div>

        </>}
        <div className="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label={pt ? 'Pastas de email' : 'Email folders'}>
          {(['inbox', 'sent', 'spam', 'trash'] as const).map(value => <button key={value} type="button" aria-pressed={folder === value} onClick={() => { resetList(); setFolder(value); }}
            className={cn('flex min-h-10 items-center gap-2 border-b-2 text-sm transition-colors', folder === value ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {value === 'inbox' ? <Inbox className="size-4" /> : value === 'sent' ? <Send className="size-4" /> : value === 'spam' ? <ShieldAlert className="size-4" /> : <Trash2 className="size-4" />}
            {value === 'inbox' ? (pt ? 'Entrada' : 'Inbox') : value === 'sent' ? (pt ? 'Enviados' : 'Sent') : value === 'spam' ? 'Spam' : (pt ? 'Lixeira' : 'Trash')}
          </button>)}
        </div>
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={pt ? 'Buscar nos emails carregados…' : 'Search loaded emails…'} aria-label={pt ? 'Buscar nos emails carregados' : 'Search loaded emails'} className="h-10 bg-card pl-9 text-base md:text-sm" /></div>
        <div className="uorqui-inbox-filters flex flex-wrap items-center gap-1" role="group" aria-label={pt ? 'Filtrar emails' : 'Filter emails'}>
          {(['all', 'unread', 'starred'] as const).map(value => <button type="button" key={value} aria-pressed={filter === value}
            disabled={moving} onClick={() => { resetList(); setFilter(value); }} className="min-h-9 rounded-md px-3 text-xs font-medium">
            {value === 'all' ? (pt ? 'Todos' : 'All') : value === 'unread' ? (pt ? 'Não lidos' : 'Unread') : (pt ? 'Favoritos' : 'Starred')}
          </button>)}
          {account && <Button type="button" size="sm" variant={selectionMode ? 'secondary' : 'ghost'} className="ml-auto"
            disabled={moving || loading} onClick={() => { setSelectionMode(value => !value); setSelectedIds([]); }}>
            {selectionMode ? (pt ? 'Cancelar' : 'Cancel') : (pt ? 'Selecionar' : 'Select')}
          </Button>}
        </div>
        {selectionMode && account && <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-2 text-xs">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" disabled={moving || !visibleIds.length} checked={allVisibleSelected}
              onChange={toggleVisible} aria-label={pt ? 'Selecionar todos os emails visíveis' : 'Select all visible emails'} />
            {pt ? 'Selecionar todos' : 'Select all'}
          </label>
          <span className="ml-auto text-muted-foreground">{selectedIds.length}/100</span>
          <Button type="button" variant="outline" size="sm" disabled={!selectedIds.length || moving}
            onClick={() => void moveSelected('spam')} className="gap-1">
            <ShieldAlert className="size-3.5" /> Spam
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!selectedIds.length || moving}
            onClick={() => void moveSelected('trash')} className="gap-1">
            {moving ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" />}
            {pt ? 'Lixeira' : 'Trash'}
          </Button>
        </div>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">

        {notice && <div role="status" className="flex items-start gap-2 border-b border-border bg-muted/40 p-4 text-xs"><span className="flex-1">{notice === 'connected' ? (pt ? 'Conta conectada com sucesso.' : 'Account connected successfully.')
            : notice === 'sent' ? (pt ? 'Email enviado.' : 'Email sent.')
            : notice === 'movedTrash' ? (pt ? 'Mensagens movidas para Lixeira.' : 'Messages moved to Trash.')
            : notice === 'movedSpam' ? (pt ? 'Mensagens movidas para Spam.' : 'Messages moved to Spam.')
            : mailOAuthFailureMessage(mailFailureReason, pt, mailFailureProvider)}</span><button type="button" onClick={() => setNotice('')} aria-label={pt ? 'Fechar aviso' : 'Dismiss notice'}><X className="size-4" /></button></div>}
        {error && <div role="alert" className="m-3 rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}<Button variant="outline" size="sm" className="mt-2" onClick={() => { setPage(''); setRefresh(value => value + 1); setAccountRefresh(value => value + 1); }}>{pt ? 'Tentar novamente' : 'Retry'}</Button></div>}
        {(loadingAccounts || (loading && !messages.length)) &&
          <WorkspaceContentLoading label={pt?'Carregando emails':'Loading emails'} rows={4} className="p-4"/>}
        {!loadingAccounts && !account && !error && <div className="space-y-4 px-5 py-8"><div className="grid size-11 place-items-center rounded-xl border border-border bg-card"><Link2 className="size-5 text-muted-foreground" /></div>
          <h2 className="font-medium">{pt ? 'Seu email, por perto' : 'Your email, close by'}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{pt ? 'Conecte Gmail, Outlook ou configure IMAP/SMTP para acompanhar sua caixa de entrada no Uorqui.' : 'Connect Gmail, Outlook or set up IMAP/SMTP to use your mailbox in Uorqui.'}</p>
          <Button type="button" variant="outline" onClick={openMailConfiguration} className="min-h-11 gap-2">
            <Plus className="size-4"/>{pt?'Conectar e-mail':'Connect email'}
          </Button>
          {webOrigin && window.location.origin !== webOrigin && <p className="text-xs leading-5 text-muted-foreground">
            {pt ? 'Para vincular sua conta, acesse o domínio oficial: ' : 'To connect your mailbox, open the official domain: '}
            <a className="font-medium underline underline-offset-2" href={webOrigin}>{webOrigin}</a>
          </p>}
          {providers.length > 0 && !providers.some(item => item.configured) && <p className="text-xs leading-5 text-muted-foreground">{pt ? 'OAuth indisponível sem credenciais do provedor; você pode usar um servidor manual.' : 'OAuth requires provider credentials; manual servers remain supported.'}</p>}
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" />{pt ? 'Gmail e Outlook usam OAuth; servidores manuais usam uma senha de aplicativo, armazenada criptografada no Uorqui.' : 'Gmail and Outlook use OAuth; manual servers use an app password encrypted in Uorqui.'}</p>
        </div>}
        {visible.map(message => <div key={message.id} className={cn('uorqui-inbox-row flex w-full min-w-0 items-center border-b border-border transition-colors hover:bg-muted/60', selected?.id === message.id && !selectionMode && 'bg-secondary/70', selectionMode && selectedIds.includes(message.id) && 'bg-muted/80')}>
          {selectionMode && <label className="flex min-h-12 shrink-0 cursor-pointer items-center px-3" aria-label={pt ? 'Selecionar email' : 'Select email'}>
            <input type="checkbox" checked={selectedIds.includes(message.id)} disabled={moving || (selectedIds.length >= 100 && !selectedIds.includes(message.id))}
              onChange={() => toggleSelected(message.id)} aria-label={pt ? 'Selecionar ' + (message.subject || message.from) : 'Select ' + (message.subject || message.from)} />
          </label>}
          <button type="button" disabled={moving} onClick={() => selectionMode ? toggleSelected(message.id) : void showMessage(message)}
            aria-current={selected?.id === message.id && !selectionMode ? 'true' : undefined}
            className="min-w-0 flex-1 px-4 py-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            <div className="mb-1.5 flex items-center gap-2">{message.unread && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label={pt ? 'Não lido' : 'Unread'} />}<span className={cn('min-w-0 flex-1 truncate text-xs', message.unread ? 'font-semibold' : 'text-muted-foreground')}>{message.from}</span><time className="shrink-0 text-[10px] text-muted-foreground">{date(message.date)}</time></div>
            <p className="flex items-center gap-2 text-[13px] font-medium"><span className="truncate">{message.subject || (pt ? '(Sem assunto)' : '(No subject)')}</span>{message.starred && <Star className="size-3 shrink-0 fill-current text-muted-foreground" />}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{message.preview}</p>
          </button>
        </div>)}
        {account && !loading && !error && visible.length === 0 && <div className="px-6 py-14 text-center"><Inbox className="mx-auto mb-3 size-7 text-muted-foreground" /><p className="text-sm font-medium">{pt ? 'Nenhum email por aqui' : 'No email here'}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{pt ? 'Tente outra pasta, filtro ou busca.' : 'Try a different folder, filter or search.'}</p></div>}
        {nextPage && !query && <Button variant="ghost" className="my-3 w-full" disabled={loading} onClick={() => setPage(nextPage)}>{loading ? <Spinner /> : (pt ? 'Carregar mais' : 'Load more')}</Button>}
      </div>
    </aside>

    <section aria-label={pt ? 'Leitura de email' : 'Email reader'} className={cn('min-h-0 min-w-0 flex-1 flex-col bg-background', open ? 'flex' : 'hidden md:flex')}>
      {compose ? <form onSubmit={event => void submit(event)} className="flex min-h-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center gap-3 border-b border-border px-4"><Button type="button" variant="ghost" size="icon" disabled={sending} onClick={closeDetail} aria-label={pt ? 'Voltar para emails' : 'Back to email'}><ArrowLeft className="size-4" /></Button><h2 className="text-sm font-medium">{pt ? 'Novo email' : 'New email'}</h2></header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6"><p className="text-xs text-muted-foreground">{pt ? 'De: ' : 'From: '}{account?.email}</p>
          <label className="block space-y-2 text-xs"><span>{pt ? 'Para' : 'To'}</span><Input type="email" required maxLength={320} disabled={sending} value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} placeholder="pessoa@exemplo.com" /></label>
          <label className="block space-y-2 text-xs"><span>{pt ? 'Assunto' : 'Subject'}</span><Input maxLength={200} disabled={sending} value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value })} /></label>
          <label className="block space-y-2 text-xs"><span>{pt ? 'Mensagem' : 'Message'}</span><textarea required maxLength={30000} disabled={sending} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} className="min-h-60 w-full resize-y rounded-md border border-input bg-transparent p-3 text-base leading-7 outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" /></label>
          {sendError && <p role="alert" className="text-sm text-destructive">{sendError}</p>}
        </div>
        <footer className="flex justify-end border-t border-border p-4"><Button disabled={sending} className="min-h-11 gap-2" type="submit">{sending ? <Spinner className="size-4" /> : <Send className="size-4" />}{pt ? 'Enviar email' : 'Send email'}</Button></footer>
      </form> : selected ? <>
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-3"><Button variant="ghost" size="icon" onClick={closeDetail} aria-label={pt ? 'Voltar para emails' : 'Back to email'}><ArrowLeft className="size-4" /></Button>
          <span className="truncate text-xs text-muted-foreground">{account?.email}</span>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={() => { setReplying(true); setReplyError(''); }} className="gap-2" disabled={loadingBody || replySending}>
              <Reply className="size-4" />{pt ? 'Responder' : 'Reply'}
            </Button>
            <Button size="sm" variant="ghost" onClick={startCompose} className="gap-2"><Plus className="size-4" />{pt ? 'Novo' : 'New'}</Button>
          </div></header>
        <article key={selected.id} className="uorqui-kit-content-enter min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-8"><h2 className="break-words text-xl font-semibold tracking-tight">{selected.subject || (pt ? '(Sem assunto)' : '(No subject)')}</h2>
          <div className="my-6 space-y-2 border-b border-border pb-6 text-xs text-muted-foreground"><p className="break-words font-medium text-foreground">{selected.from}</p><p className="break-words">{pt ? 'Para: ' : 'To: '}{selected.to}</p><p>{date(selected.date)}</p></div>
          {loadingBody ? <WorkspaceContentLoading label={pt?'Carregando mensagem':'Loading message'} rows={3} /> : framedHtml ? <>
            <div className={cn('relative w-full min-w-0',!htmlFrameReady&&'min-h-[280px]')}>
              {!htmlFrameReady&&<WorkspaceContentLoading
                label={pt?'Montando conteúdo e imagens do e-mail':'Rendering email content and images'}
                rows={4} className="w-full py-2"/>}
            <iframe key={selected.accountId+':'+selected.id} title={pt ? 'Conteúdo seguro da mensagem' : 'Safe message content'}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer" srcDoc={framedHtml}
              onLoad={event=>{
                // The frame cannot run scripts, submit forms or navigate the
                // workspace. Sanitized native _blank links escape the sandbox;
                // parent window.open from iframe clicks is blocked on iOS PWA.
                const frame=event.currentTarget;
                const doc=frame.contentDocument;
                if(!doc)return;
                // Many promotional emails use fixed 600-800px tables. Fit the
                // whole HTML layout into the frame, not each individual photo.
                mailFrameCleanup.current?.();
                let alive=true;
                const fitFrame=()=>{
                  if(!frame.isConnected||!doc.body||!doc.documentElement)return;
                  const root=doc.documentElement,body=doc.body;
                  const availableWidth=Math.max(1,frame.clientWidth-2);
                  // Re-measure without the previous scale or height: otherwise
                  // the old iframe dimensions distort our next calculation.
                  frame.style.height='1px';
                  body.style.transform='none';
                  body.style.width='';
                  const layoutWidth=Math.max(body.scrollWidth,root.scrollWidth,availableWidth);
                  if(layoutWidth>availableWidth)body.style.width=layoutWidth+'px';
                  const contentWidth=Math.max(layoutWidth,body.scrollWidth);
                  const scale=Math.min(1,availableWidth/contentWidth);
                  body.style.transformOrigin='top left';
                  body.style.transform=scale<0.999?'scale('+scale+')':'none';
                  root.style.setProperty('overflow-x','hidden','important');
                  const naturalHeight=Math.max(body.scrollHeight,body.offsetHeight);
                  // Let the email reader do the vertical scrolling. Cap only
                  // extraordinarily tall HTML to avoid excessive browser surfaces.
                  frame.style.height=Math.max(120,Math.min(24000,Math.ceil(naturalHeight*scale+12)))+'px';
                };
                let fitRaf=0;
                const scheduleFit=()=>{
                  if(fitRaf)window.cancelAnimationFrame(fitRaf);
                  fitRaf=window.requestAnimationFrame(()=>{fitRaf=0;fitFrame();});
                };
                const images=Array.from(doc.images);
                for(const image of images){
                  image.addEventListener('load',scheduleFit);
                  image.addEventListener('error',scheduleFit);
                }
                let lastFrameWidth=frame.clientWidth;
                const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{
                  const width=frame.clientWidth;
                  if(width!==lastFrameWidth){lastFrameWidth=width;scheduleFit();}
                }):null;
                observer?.observe(frame.parentElement??frame);
                window.addEventListener('resize',scheduleFit);
                mailFrameCleanup.current=()=>{
                  alive=false;
                  observer?.disconnect();
                  window.removeEventListener('resize',scheduleFit);
                  if(fitRaf)window.cancelAnimationFrame(fitRaf);
                  for(const image of images){
                    image.removeEventListener('load',scheduleFit);
                    image.removeEventListener('error',scheduleFit);
                  }
                };
                fitFrame();
                const openImage=(target:EventTarget|null)=>{
                  // iframe elements belong to another window realm, so the
                  // parent's HTMLImageElement instanceof checks are unreliable.
                  const element=target as Element|null;
                  // A banner can be both an image and a link: let its native
                  // _blank link open, instead of swallowing the tap for zoom.
                  if(element?.closest?.('a[href], area[href]'))return false;
                  const image=element?.tagName?.toLowerCase()==='img'?element as HTMLImageElement:
                    element?.closest?.('img') as HTMLImageElement|null;
                  if(!image)return false;
                  const src=image.currentSrc||image.src;
                  if(!/^https:\/\//i.test(src)&&!/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(src))return false;
                  setExpandedImage({src,alt:image.alt|| (pt?'Imagem do e-mail':'Email image')});
                  return true;
                };
                // srcDoc resolves relative links against the Uorqui origin,
                // which would be unsafe. Keep only explicit HTTP(S) destinations
                // and let the browser handle the actual native link click.
                // Native target=_blank requires BOTH allow-popups sandbox flags:
                // JS window.open from a parent click listener is unreliable in
                // Safari PWAs and can leave the destination inside the iframe.
                doc.querySelectorAll<HTMLAnchorElement | HTMLAreaElement>('a[href],area[href]').forEach(link=>{
                  const raw=link.getAttribute('href')?.trim()??'';
                  let safeUrl:string|null=null;
                  try{
                    if(/^https?:\/\//i.test(raw)||raw.startsWith('//')){
                      const url=new URL(raw.startsWith('//')?'https:'+raw:raw);
                      if(url.protocol==='http:'||url.protocol==='https:')safeUrl=url.href;
                    }
                  }catch{/* Malformed or unsafe destinations are not followed. */}
                  if(!safeUrl){
                    link.removeAttribute('href');
                    link.removeAttribute('target');
                    return;
                  }
                  link.setAttribute('href',safeUrl);
                  link.setAttribute('target','_blank');
                  link.setAttribute('rel','noopener noreferrer external');
                  link.setAttribute('referrerpolicy','no-referrer');
                });
                doc.querySelectorAll('img').forEach(img=>{
                  if(img.closest('a[href]'))return;
                  img.style.setProperty('cursor','zoom-in','important');
                  img.setAttribute('tabindex','0');
                  img.setAttribute('role','button');
                  img.setAttribute('aria-label',pt?'Ampliar imagem':'Enlarge image');
                });
                const handleClick=(e:MouseEvent)=>{
                  // Valid external links must keep their default native action.
                  if((e.target as Element|null)?.closest?.('a[href],area[href]'))return;
                  if(openImage(e.target))e.preventDefault();
                };
                const handleKeyDown=(e:KeyboardEvent)=>{
                  if((e.key==='Enter'||e.key===' ')&&
                    (e.target as Element|null)?.tagName?.toLowerCase()==='img'&&openImage(e.target)){
                    e.preventDefault();
                  }
                };
                doc.addEventListener('click',handleClick,true);
                doc.addEventListener('keydown',handleKeyDown,true);
                // Stay on the skeleton until the document, web fonts, remote
                // image loads/errors and responsive fitting have settled.
                const pendingImages=new Set(images.filter(image=>!image.complete));
                let fontsReady=!doc.fonts,readyRaf=0;
                let maxWait=0;
                const finishIfReady=()=>{
                  if(!alive||!frame.isConnected||!fontsReady||pendingImages.size)return;
                  if(maxWait)window.clearTimeout(maxWait);
                  if(readyRaf)window.cancelAnimationFrame(readyRaf);
                  readyRaf=window.requestAnimationFrame(()=>{
                    if(!alive)return;
                    fitFrame();
                    readyRaf=window.requestAnimationFrame(()=>{
                      if(!alive||!frame.isConnected)return;
                      fitFrame();
                      setReadyFrame({accountId:selected.accountId,messageId:selected.id,html:selected.html!});
                    });
                  });
                };
                const imageSettled=(event:Event)=>{
                  pendingImages.delete(event.currentTarget as HTMLImageElement);
                  finishIfReady();
                };
                for(const image of images){
                  image.addEventListener('load',imageSettled);
                  image.addEventListener('error',imageSettled);
                  // Do not leave below-fold marketing images waiting on lazy
                  // loading forever while the email reader is hidden.
                  if(!image.complete)image.loading='eager';
                }
                if(doc.fonts)void doc.fonts.ready.then(()=>{
                  fontsReady=true;finishIfReady();
                }).catch(()=>{fontsReady=true;finishIfReady();});
                // A broken tracking pixel must not freeze the reader forever.
                // Any late asset still re-fits the frame after it finishes.
                maxWait=window.setTimeout(()=>{
                  pendingImages.clear();fontsReady=true;finishIfReady();
                },15000);
                finishIfReady();
                const cleanupLayout=mailFrameCleanup.current;
                mailFrameCleanup.current=()=>{
                  cleanupLayout?.();
                  if(maxWait)window.clearTimeout(maxWait);
                  if(readyRaf)window.cancelAnimationFrame(readyRaf);
                  doc.removeEventListener('click',handleClick,true);
                  doc.removeEventListener('keydown',handleKeyDown,true);
                  for(const image of images){
                    image.removeEventListener('load',imageSettled);
                    image.removeEventListener('error',imageSettled);
                  }
                };
              }}
              className={cn('min-h-[120px] w-full rounded-md border border-border bg-white',
                !htmlFrameReady&&'pointer-events-none absolute left-0 top-0 opacity-0')}
              style={{height:240}} />
            </div>
          </> : selected.body !== undefined ? <div className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{selected.body}</div> : <p className="text-sm text-muted-foreground">{pt ? 'Não foi possível carregar a mensagem. Volte e tente novamente.' : 'Could not load the message. Go back and try again.'}</p>}
          {replying && !loadingBody && <form onSubmit={event => void submitReply(event)} className="mt-6 space-y-3 border-t border-border pt-5">
            <p className="text-xs font-medium">{pt ? 'Responder a ' : 'Reply to '}{selected.from}</p>
            <textarea value={replyBody} onChange={event => setReplyBody(event.target.value)} required maxLength={30000}
              autoFocus disabled={replySending} rows={6} placeholder={pt ? 'Escreva sua resposta…' : 'Write your reply…'}
              className="w-full resize-y rounded-md border border-input bg-background p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
            {replyError && <p role="alert" className="text-sm text-destructive">{replyError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={replySending} onClick={() => setReplying(false)}>{pt ? 'Cancelar' : 'Cancel'}</Button>
              <Button type="submit" disabled={replySending || !replyBody.trim()} className="gap-2">
                {replySending ? <Spinner className="size-4" /> : <Reply className="size-4" />}
                {pt ? 'Enviar resposta' : 'Send reply'}
              </Button>
            </div>
          </form>}
        </article>
      </> : <div className="flex min-h-0 flex-1 items-center justify-center p-8"><div className="max-w-sm text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl border border-border bg-card"><Mail className="size-6 text-muted-foreground" /></div>
        <h2 className="mt-5 text-lg font-medium tracking-tight">{pt ? 'Um espaço para cada conversa' : 'A space for every conversation'}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{account ? (pt ? 'Selecione um email para ler ou comece uma nova mensagem.' : 'Select an email to read or start a new message.') : (pt ? 'Mensagens, comunidades e sua caixa de entrada. Tudo conectado no Uorqui.' : 'Messages, communities and your inbox. All connected in Uorqui.')}</p>
        {account && <Button variant="outline" className="mt-5 gap-2" onClick={startCompose}>{pt ? 'Escrever email' : 'Write email'}<ArrowUpRight className="size-4" /></Button>}
      </div></div>}
    </section>
    {connectPicker&&createPortal(
      <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/65 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onMouseDown={event=>{if(event.target===event.currentTarget)closeMailConfiguration();}}>
        <div ref={mailDialogRef} role="dialog" aria-modal="true" aria-labelledby={mailDialogTitleId}
          tabIndex={-1} onKeyDown={modalKeyDown}
          className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl outline-none">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <h2 id={mailDialogTitleId} className="text-base font-semibold">{pt?'Configuração de e-mail':'Email configuration'}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{pt?
                'Conecte Gmail, Outlook ou configure um servidor IMAP/SMTP.':
                'Connect Gmail, Outlook or configure an IMAP/SMTP server.'}</p>
            </div>
            <Button type="button" size="icon" variant="ghost" className="shrink-0"
              disabled={savingManual||Boolean(connecting)} aria-label={pt?'Fechar configuração':'Close configuration'}
              onClick={closeMailConfiguration}><X className="size-5"/></Button>
          </header>
          <div ref={mailDialogScrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{pt?'Escolha como conectar':'Choose how to connect'}</h3>
              {connectButtons}
            </div>
            {connectError&&<p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{connectError}</p>}
            {manualForm}
            <p className="text-xs leading-5 text-muted-foreground">{pt?
              'Você pode adicionar outro endereço, inclusive do mesmo provedor. As credenciais manuais são armazenadas criptografadas.':
              'You can add another address, even from the same provider. Manual credentials are stored encrypted.'}</p>
          </div>
        </div>
      </div>,document.body)}
    {expandedImage&&<div role="dialog" aria-modal="true" aria-label={pt?'Imagem ampliada':'Enlarged image'}
      className="fixed inset-0 z-[210] flex flex-col bg-black/90 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onKeyDown={event=>{if(event.key==='Escape')setExpandedImage(null);}}>
      <div className="flex shrink-0 justify-end">
        <Button type="button" variant="secondary" size="icon" autoFocus aria-label={pt?'Fechar imagem':'Close image'}
          onClick={()=>setExpandedImage(null)}><X className="size-5"/></Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto" onClick={()=>setExpandedImage(null)}>
        <img src={expandedImage.src} alt={expandedImage.alt}
          className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer"
          onClick={event=>event.stopPropagation()}/>
      </div>
    </div>}
  </div>;
}
