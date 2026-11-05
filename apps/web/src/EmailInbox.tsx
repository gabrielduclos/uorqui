import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Inbox, Link2, Mail, Plus, RefreshCw, Search, Send, ShieldCheck, Star, Unplug, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useUorquiPreferences } from './UorquiPreferences';

type Provider = 'gmail' | 'outlook';
type MailAccount = { id: string; provider: Provider; email: string };
type Message = { id: string; from: string; to: string; subject: string; preview: string; date: string; unread: boolean; starred: boolean; body?: string };
type Accounts = { accounts: MailAccount[]; providers: { id: Provider; configured: boolean }[] };
const providerName = (provider: Provider) => provider === 'gmail' ? 'Gmail' : 'Outlook';

async function requestMail<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/v1/mail/' + path, { credentials: 'same-origin', cache: 'no-store', ...init });
  const data = await response.json().catch(() => null) as T & { error?: string };
  if (!response.ok || !data) throw Error(data?.error ?? 'MAIL_UNAVAILABLE');
  return data;
}

export default function EmailInbox({ onMobileOpenChange }: { onMobileOpenChange: (open: boolean) => void }) {
  const { locale } = useUorquiPreferences(), pt = locale === 'pt-BR';
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [providers, setProviders] = useState<Accounts['providers']>([]);
  const [accountId, setAccountId] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountRefresh, setAccountRefresh] = useState(0);
  const [folder, setFolder] = useState<'inbox' | 'sent'>('inbox');
  const [filter, setFilter] = useState<'all' | 'unread' | 'starred'>('all');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [page, setPage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('mail');
    return value === 'connected' ? 'connected' : value === 'failed' ? 'failed' : '';
  });
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [compose, setCompose] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState({ to: '', subject: '', body: '' });
  const [sendError, setSendError] = useState('');
  const detailAbort = useRef<AbortController | null>(null);
  const account = accounts.find(item => item.id === accountId);
  const open = Boolean(selected || compose);
  useEffect(() => { onMobileOpenChange(open); return () => onMobileOpenChange(false); }, [open, onMobileOpenChange]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('mail')) { url.searchParams.delete('mail'); window.history.replaceState({}, '', url.pathname + url.search + url.hash); }
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
      setAccounts(data.accounts); setProviders(data.providers);
      setAccountId(previous => data.accounts.some(item => item.id === previous) ? previous : data.accounts[0]?.id ?? '');
    }).catch(error => { if (!controller.signal.aborted) setError(explainError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingAccounts(false); });
    return () => controller.abort();
  }, [accountRefresh, explainError]);

  useEffect(() => {
    if (!accountId) { setMessages([]); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    const params = new URLSearchParams({ folder, filter, ...(page ? { page } : {}) });
    void requestMail<{ messages: Message[]; nextPage: string | null }>('accounts/' + accountId + '/messages?' + params, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setMessages(previous => page ? [...previous, ...data.messages.filter(item => !previous.some(old => old.id === item.id))] : data.messages); setNextPage(data.nextPage); } })
      .catch(error => { if (!controller.signal.aborted) setError(explainError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accountId, folder, filter, page, refresh, explainError]);

  function closeDetail() { detailAbort.current?.abort(); setSelected(null); setCompose(false); setLoadingBody(false); }
  function resetList() { closeDetail(); setMessages([]); setPage(''); setNextPage(null); setQuery(''); }
  async function connect(provider: Provider) {
    if (connecting) return;
    setConnecting(provider); setError('');
    try {
      const data = await requestMail<{ url: string }>('oauth/' + provider, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || !['accounts.google.com', 'login.microsoftonline.com'].includes(url.hostname)) throw Error('MAIL_UNAVAILABLE');
      window.location.assign(url.toString());
    } catch (error) { setError(explainError(error)); setConnecting(null); }
  }
  async function disconnect() {
    if (!account || disconnecting || !window.confirm(pt ? 'Desconectar ' + account.email + '? Seus emails continuarão no provedor.' : 'Disconnect ' + account.email + '? Your email will remain with the provider.')) return;
    setDisconnecting(true); setError('');
    try { await requestMail('accounts/' + account.id, { method: 'DELETE' }); resetList(); setAccountId(''); setAccounts([]); setAccountRefresh(value => value + 1); }
    catch (error) { setError(explainError(error)); }
    finally { setDisconnecting(false); }
  }
  async function showMessage(message: Message) {
    detailAbort.current?.abort();
    const controller = new AbortController(); detailAbort.current = controller;
    setCompose(false); setSelected(message); setLoadingBody(true); setError('');
    try {
      const data = await requestMail<Message>('accounts/' + accountId + '/messages/' + encodeURIComponent(message.id), { signal: controller.signal });
      if (!controller.signal.aborted) setSelected(data);
    } catch (error) { if (!controller.signal.aborted) setError(explainError(error)); }
    finally { if (!controller.signal.aborted) setLoadingBody(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (sending || !account) return;
    setSending(true); setSendError('');
    try {
      await requestMail('accounts/' + account.id + '/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      setDraft({ to: '', subject: '', body: '' }); setCompose(false); setNotice('sent'); setPage(''); setRefresh(value => value + 1);
    } catch { setSendError(pt ? 'Não foi possível confirmar o envio. Verifique a pasta Enviados antes de tentar novamente.' : 'Could not confirm delivery. Check Sent before trying again.'); }
    finally { setSending(false); }
  }
  function startCompose() { detailAbort.current?.abort(); setSelected(null); setCompose(true); setSendError(''); }
  const visible = messages.filter(message => (message.from + ' ' + message.subject + ' ' + message.preview).toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString(locale, { day: 'numeric', month: 'short' }); }
  const connectButtons = <div className="flex flex-wrap gap-2">{(['gmail', 'outlook'] as const).map(provider => {
    const ready = providers.some(item => item.id === provider && item.configured);
    return <Button key={provider} type="button" variant="outline" disabled={!ready || Boolean(connecting) || loadingAccounts}
      onClick={() => void connect(provider)} title={!ready ? (pt ? 'A integração ainda não foi configurada' : 'Integration is not configured yet') : undefined} className="min-h-11 gap-2">
      {connecting === provider ? <Spinner className="size-4" /> : <Plus className="size-4" />}{providerName(provider)}
    </Button>;
  })}</div>;

  return <div data-uorqui-email className="relative flex h-full min-h-0 min-w-0 overflow-hidden">
    <aside className={cn('flex h-full min-h-0 w-full min-w-0 flex-col border-r border-border bg-background md:w-[340px] md:shrink-0 xl:w-[380px]', open && 'max-md:hidden')}>
      <header className="shrink-0 space-y-4 border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2"><h1 className="text-lg font-semibold tracking-tight">Email</h1>
          <div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={pt ? 'Atualizar emails' : 'Refresh email'} disabled={loading || loadingAccounts}
            onClick={() => { setPage(''); setRefresh(value => value + 1); setAccountRefresh(value => value + 1); }}><RefreshCw className="size-4" /></Button>
            <Button size="icon" variant="ghost" aria-label={pt ? 'Novo email' : 'New email'} disabled={!account} onClick={startCompose}><Plus className="size-4" /></Button></div>
        </div>
        {account && <div className="flex items-center gap-1"><select aria-label={pt ? 'Conta de email' : 'Email account'} value={accountId} disabled={sending}
          onChange={event => { resetList(); setAccountId(event.target.value); }} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm">
          {accounts.map(item => <option key={item.id} value={item.id}>{item.email}</option>)}
        </select><Button size="icon" variant="ghost" aria-label={pt ? 'Desconectar conta' : 'Disconnect account'} disabled={disconnecting || sending} onClick={() => void disconnect()}><Unplug className="size-4" /></Button></div>}
        <div className="flex gap-4" role="group" aria-label={pt ? 'Pastas de email' : 'Email folders'}>
          {(['inbox', 'sent'] as const).map(value => <button key={value} type="button" aria-pressed={folder === value} onClick={() => { resetList(); setFolder(value); }}
            className={cn('flex min-h-10 items-center gap-2 border-b-2 text-sm transition-colors', folder === value ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {value === 'inbox' ? <Inbox className="size-4" /> : <Send className="size-4" />}{value === 'inbox' ? (pt ? 'Caixa de entrada' : 'Inbox') : (pt ? 'Enviados' : 'Sent')}
          </button>)}
        </div>
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={pt ? 'Buscar nos emails carregados…' : 'Search loaded emails…'} aria-label={pt ? 'Buscar nos emails carregados' : 'Search loaded emails'} className="h-10 bg-card pl-9 text-base md:text-sm" /></div>
        <div className="uorqui-inbox-filters flex gap-1" role="group" aria-label={pt ? 'Filtrar emails' : 'Filter emails'}>
          {(['all', 'unread', 'starred'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value}
            onClick={() => { resetList(); setFilter(value); }} className="min-h-9 rounded-md px-3 text-xs font-medium">
            {value === 'all' ? (pt ? 'Todos' : 'All') : value === 'unread' ? (pt ? 'Não lidos' : 'Unread') : (pt ? 'Favoritos' : 'Starred')}
          </button>)}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {notice && <div role="status" className="flex items-start gap-2 border-b border-border bg-muted/40 p-4 text-xs"><span className="flex-1">{notice === 'connected' ? (pt ? 'Conta conectada com sucesso.' : 'Account connected successfully.') : notice === 'sent' ? (pt ? 'Email enviado.' : 'Email sent.') : (pt ? 'Não foi possível conectar a conta. Tente novamente.' : 'Could not connect your account. Please try again.')}</span><button type="button" onClick={() => setNotice('')} aria-label={pt ? 'Fechar aviso' : 'Dismiss notice'}><X className="size-4" /></button></div>}
        {error && <div role="alert" className="m-3 rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}<Button variant="outline" size="sm" className="mt-2" onClick={() => { setPage(''); setRefresh(value => value + 1); setAccountRefresh(value => value + 1); }}>{pt ? 'Tentar novamente' : 'Retry'}</Button></div>}
        {(loadingAccounts || (loading && !messages.length)) && <div role="status" aria-label={pt ? 'Carregando emails' : 'Loading email'} className="space-y-5 p-4">{[0, 1, 2, 3].map(i => <div key={i} className="animate-pulse space-y-3"><div className="h-3 w-1/2 rounded bg-muted" /><div className="h-3 w-4/5 rounded bg-muted" /><div className="h-3 w-3/5 rounded bg-muted" /></div>)}</div>}
        {!loadingAccounts && !account && !error && <div className="space-y-4 px-5 py-8"><div className="grid size-11 place-items-center rounded-xl border border-border bg-card"><Link2 className="size-5 text-muted-foreground" /></div>
          <h2 className="font-medium">{pt ? 'Seu email, por perto' : 'Your email, close by'}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{pt ? 'Conecte Gmail ou Outlook para acompanhar sua caixa de entrada e enviar emails sem sair do Uorqui.' : 'Connect Gmail or Outlook to follow your inbox and send email from Uorqui.'}</p>
          {connectButtons}
          {providers.length > 0 && !providers.some(item => item.configured) && <p className="text-xs leading-5 text-muted-foreground">{pt ? 'A conexão estará disponível quando a integração OAuth for configurada pelo administrador.' : 'Connection will be available once the administrator configures OAuth.'}</p>}
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" />{pt ? 'Autorização pelo provedor, sem compartilhar sua senha com o Uorqui.' : 'Authorize through your provider without sharing your password with Uorqui.'}</p>
        </div>}
        {visible.map(message => <button type="button" key={message.id} onClick={() => void showMessage(message)} aria-current={selected?.id === message.id ? 'true' : undefined}
          className={cn('uorqui-inbox-row w-full border-b border-border px-4 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring', selected?.id === message.id && 'bg-secondary/70')}>
          <div className="mb-1.5 flex items-center gap-2">{message.unread && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label={pt ? 'Não lido' : 'Unread'} />}<span className={cn('min-w-0 flex-1 truncate text-xs', message.unread ? 'font-semibold' : 'text-muted-foreground')}>{message.from}</span><time className="shrink-0 text-[10px] text-muted-foreground">{date(message.date)}</time></div>
          <p className="flex items-center gap-2 text-[13px] font-medium"><span className="truncate">{message.subject || (pt ? '(Sem assunto)' : '(No subject)')}</span>{message.starred && <Star className="size-3 shrink-0 fill-current text-muted-foreground" />}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{message.preview}</p>
        </button>)}
        {account && !loading && !error && visible.length === 0 && <div className="px-6 py-14 text-center"><Inbox className="mx-auto mb-3 size-7 text-muted-foreground" /><p className="text-sm font-medium">{pt ? 'Nenhum email por aqui' : 'No email here'}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{pt ? 'Tente outra pasta, filtro ou busca.' : 'Try a different folder, filter or search.'}</p></div>}
        {nextPage && !query && <Button variant="ghost" className="my-3 w-full" disabled={loading} onClick={() => setPage(nextPage)}>{loading ? <Spinner /> : (pt ? 'Carregar mais' : 'Load more')}</Button>}
      </div>
      {account && <footer className="shrink-0 space-y-2 border-t border-border p-3"><p className="text-[11px] text-muted-foreground">{pt ? 'Conectar ou autorizar novamente' : 'Connect or authorize again'}</p>{connectButtons}</footer>}
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
          <span className="truncate text-xs text-muted-foreground">{account?.email}</span><Button size="sm" variant="ghost" onClick={startCompose} className="gap-2"><Plus className="size-4" />{pt ? 'Novo' : 'New'}</Button></header>
        <article className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-8"><h2 className="break-words text-xl font-semibold tracking-tight">{selected.subject || (pt ? '(Sem assunto)' : '(No subject)')}</h2>
          <div className="my-6 space-y-2 border-b border-border pb-6 text-xs text-muted-foreground"><p className="break-words font-medium text-foreground">{selected.from}</p><p className="break-words">{pt ? 'Para: ' : 'To: '}{selected.to}</p><p>{date(selected.date)}</p></div>
          {loadingBody ? <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" />{pt ? 'Carregando mensagem…' : 'Loading message…'}</div> : selected.body !== undefined ? <div className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{selected.body}</div> : <p className="text-sm text-muted-foreground">{pt ? 'Não foi possível carregar a mensagem. Volte e tente novamente.' : 'Could not load the message. Go back and try again.'}</p>}
        </article>
      </> : <div className="flex min-h-0 flex-1 items-center justify-center p-8"><div className="max-w-sm text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl border border-border bg-card"><Mail className="size-6 text-muted-foreground" /></div>
        <h2 className="mt-5 text-lg font-medium tracking-tight">{pt ? 'Um espaço para cada conversa' : 'A space for every conversation'}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{account ? (pt ? 'Selecione um email para ler ou comece uma nova mensagem.' : 'Select an email to read or start a new message.') : (pt ? 'Mensagens, comunidades e sua caixa de entrada. Tudo conectado no Uorqui.' : 'Messages, communities and your inbox. All connected in Uorqui.')}</p>
        {account && <Button variant="outline" className="mt-5 gap-2" onClick={startCompose}>{pt ? 'Escrever email' : 'Write email'}<ArrowUpRight className="size-4" /></Button>}
      </div></div>}
    </section>
  </div>;
}
