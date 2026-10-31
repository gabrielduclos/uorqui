import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, CheckCheck, MessageCircle, Search, Send, UserPlus, X } from 'lucide-react';
import { UserAvatar } from './UserProfiles';
import { useUorquiPreferences } from './UorquiPreferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Conversation = {
  id: string; peerHandle: string; peerName: string; peerAvatarUrl: string | null;
  lastBody: string | null; lastAt: string | null; lastAuthorId: string | null; unreadCount: number;
};
type Person = { handle: string; displayName: string; avatarUrl: string | null };
type Message = {
  id: string; conversationId: string; authorId: string; body: string;
  clientId: string | null; createdAt: string; readAt: string | null;
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials:'same-origin', cache:'no-store', ...options });
  if (!response.ok) {
    if (response.status === 401) throw new Error('UNAUTHORIZED');
    throw new Error('HTTP_' + response.status);
  }
  return response.json() as Promise<T>;
}
function formatTime(value: string | null | undefined, locale: string) {
  if (!value) return '';
  const d=new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'});
}

/** Text-only first release. All messages are persisted server-side. */
export default function LiveDirectChat({ myId, initialHandle, onStarted, onMobileOpenChange }: {
  myId: string; initialHandle?: string | null; onStarted?: () => void;
  onMobileOpenChange?: (open: boolean) => void;
}) {
  const { locale } = useUorquiPreferences();
  const pt = locale === 'pt-BR';
  const [threads,setThreads] = useState<Conversation[]>([]);
  const [people,setPeople] = useState<Person[]>([]);
  const [search,setSearch] = useState('');
  const [activeId,setActiveId] = useState<string | null>(null);
  const [mobileOpened,setMobileOpened] = useState(false);
  const [messages,setMessages] = useState<Message[]>([]);
  const [draft,setDraft] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [searching,setSearching] = useState(false);
  const [chatError,setChatError] = useState('');
  const [live,setLive] = useState(false);
  const realtimeConnected = useRef(false);
  const lastThreadFallback = useRef(0);
  const lastMessageFallback = useRef(0);
  const scrollBox = useRef<HTMLDivElement>(null);
  const sendId = useRef<string | null>(null);
  const reading = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const handledHandle = useRef<string | null>(null);
  activeIdRef.current=activeId;
  useEffect(() => onMobileOpenChange?.(mobileOpened), [mobileOpened, onMobileOpenChange]);

  const loadThreads = useCallback(async () => {
    const response=await api<{conversations:Conversation[]}>('/api/v1/dm/conversations');
    setThreads(response.conversations);
    setError('');
    setLoading(false);
    return response.conversations;
  },[]);

  useEffect(() => {
    let mounted=true;
    void loadThreads().catch(() => { if(mounted){setLoading(false);setError(pt?'Não foi possível carregar suas conversas.':'Could not load your conversations.');}});
    const interval=window.setInterval(() => {
      if(document.visibilityState!=='visible') return;
      if(!realtimeConnected.current || Date.now()-lastThreadFallback.current>=25_000) {
        lastThreadFallback.current=Date.now();
        void loadThreads().catch(()=>{});
      }
    },4000);
    return () => {mounted=false;window.clearInterval(interval);};
  },[loadThreads,pt]);

  useEffect(() => {
    const q=search.trim();
    if(q.length<2){setPeople([]);setSearching(false);return;}
    const ctrl=new AbortController();
    const timeout=window.setTimeout(() => {
      setSearching(true);
      void api<{people:Person[]}>('/api/v1/dm/people?q='+encodeURIComponent(q),{signal:ctrl.signal})
        .then(x=>setPeople(x.people))
        .catch(()=>{if(!ctrl.signal.aborted) setPeople([]);})
        .finally(()=>{if(!ctrl.signal.aborted)setSearching(false);});
    },300);
    return()=>{ctrl.abort();window.clearTimeout(timeout);};
  },[search]);

  const openThread=useCallback((id:string)=>{
    setActiveId(id);setMobileOpened(true);setChatError('');setDraft('');sendId.current=null;
  },[]);

  const startPerson=useCallback(async (handle:string)=>{
    setBusy(true);setError('');
    try {
      const r=await api<{id:string}>('/api/v1/dm/conversations',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle})
      });
      await loadThreads();
      openThread(r.id);setSearch('');
    } catch {
      setError(pt?'Não foi possível iniciar esta conversa.':'Could not open this conversation.');
    } finally {setBusy(false);}
  },[loadThreads,openThread,pt]);

  useEffect(() => {
    if(!initialHandle) { handledHandle.current = null; return; }
    if(initialHandle === handledHandle.current) return;
    handledHandle.current=initialHandle;
    void startPerson(initialHandle).finally(()=>onStarted?.());
  },[initialHandle,startPerson,onStarted]);

  const loadMessages=useCallback(async (id:string)=>{
    const result=await api<{messages:Message[]}>('/api/v1/dm/conversations/'+id+'/messages');
    if(activeIdRef.current!==id)return;
    setMessages(prev => {
      const same=prev.length===result.messages.length && prev.every((message,index)=>
        message.id===result.messages[index].id && message.readAt===result.messages[index].readAt);
      return same?prev:result.messages;
    });
    const unread=result.messages.some(m=>m.authorId!==myId && !m.readAt);
    if(unread && !reading.current && document.visibilityState==='visible'){
      reading.current=true;
      void api('/api/v1/dm/conversations/'+id+'/read',{method:'POST'})
        .then(()=>loadThreads()).catch(()=>{}).finally(()=>{reading.current=false;});
    }
  },[myId,loadThreads]);

  useEffect(() => {
    if(!activeId){setMessages([]);return;}
    let active=true;
    setMessages([]);
    const refresh=()=>{
      if(active && document.visibilityState==='visible')void loadMessages(activeId).catch(()=>{
        if(active)setChatError(pt?'Falha ao atualizar mensagens.':'Could not refresh messages.');
      });
    };
    refresh();
    const timer=window.setInterval(() => {
      if(!realtimeConnected.current || Date.now()-lastMessageFallback.current>=25_000) {
        lastMessageFallback.current=Date.now();
        refresh();
      }
    },3000);
    return()=>{active=false;window.clearInterval(timer);};
  },[activeId,loadMessages,pt]);

  // One authenticated EventSource per visible tab. PostgreSQL NOTIFY carries only
  // change hints; message bodies are loaded through the usual authorized API.
  // Automatic EventSource reconnection plus periodic fetching cover missed events,
  // brief network outages, and proxies that do not support long-lived streams.
  useEffect(() => {
    let stream: EventSource | null=null;
    let disposed=false;
    const updateConnected=(connected:boolean)=>{
      realtimeConnected.current=connected;
      if(!disposed)setLive(connected);
    };
    const onReady=()=>{
      void loadThreads().catch(()=>{});
      if(activeIdRef.current)void loadMessages(activeIdRef.current).catch(()=>{});
    };
    const onDmUpdate=(event:Event)=>{
      try {
        const data=JSON.parse((event as MessageEvent<string>).data) as {conversationId?:string;kind?:string};
        if(!data.conversationId || !['message','read','conversation'].includes(data.kind??''))return;
        void loadThreads().catch(()=>{});
        if(activeIdRef.current===data.conversationId)void loadMessages(data.conversationId).catch(()=>{});
      }catch{/* Ignore malformed notifications. */}
    };
    const connect=()=>{
      if(disposed || document.visibilityState==='hidden' || stream || typeof EventSource==='undefined')return;
      stream=new EventSource('/api/v1/dm/events', {withCredentials:true});
      stream.addEventListener('ready',onReady);
      stream.addEventListener('dm-update',onDmUpdate);
      stream.onopen=()=>updateConnected(true);
      stream.onerror=()=>updateConnected(false); // Browser retries automatically.
    };
    const disconnect=()=>{
      updateConnected(false);
      if(!stream)return;
      stream.removeEventListener('ready',onReady);
      stream.removeEventListener('dm-update',onDmUpdate);
      stream.close();
      stream=null;
    };
    const visibility=()=>{
      if(document.visibilityState==='hidden'){disconnect();return;}
      connect();
      onReady(); // Reconcile notifications missed while in the background.
    };
    document.addEventListener('visibilitychange',visibility);
    connect();
    return()=>{disposed=true;document.removeEventListener('visibilitychange',visibility);disconnect();};
  },[loadThreads,loadMessages]);

  // Scroll only when a new message arrives, not on every periodic read receipt.
  const lastId=messages[messages.length-1]?.id ?? '';
  useEffect(()=>{
    if(lastId)scrollBox.current?.scrollTo({top:scrollBox.current.scrollHeight,behavior:'smooth'});
  },[lastId,activeId]);

  async function send(event?:FormEvent) {
    event?.preventDefault();
    const body=draft.trim();
    if(!activeId || !body || busy || body.length>4000) return;
    setBusy(true);setChatError('');
    const clientId=sendId.current ?? crypto.randomUUID();
    sendId.current=clientId;
    try{
      await api('/api/v1/dm/conversations/'+activeId+'/messages',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({body,clientId}),
      });
      sendId.current=null;
      setDraft('');
      await Promise.all([loadMessages(activeId),loadThreads()]);
    } catch {
      setChatError(pt?'Mensagem não enviada. Tente novamente.':'Message not sent. Retry.');
    }finally{setBusy(false);}
  }
  function onDraftChange(value:string){
    if(sendId.current)sendId.current=null;
    setDraft(value);
  }
  function onKeyDown(event:KeyboardEvent<HTMLTextAreaElement>){
    if(event.key==='Enter' && !event.shiftKey && !event.nativeEvent.isComposing){
      event.preventDefault();
      void send();
    }
  }
  const active=threads.find(c=>c.id===activeId);
  const query=search.trim().toLocaleLowerCase(locale);
  const visibleThreads=threads.filter(c=>(c.peerName+' '+c.peerHandle).toLocaleLowerCase(locale).includes(query));

  return <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
    <section aria-label={pt?'Lista de conversas':'Conversation list'} className={cn(
      'h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-r border-border bg-card/30 md:flex md:w-82 md:shrink-0',
      mobileOpened?'hidden':'flex'
    )}>
      <div className="shrink-0 space-y-3 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{pt?'Conversas':'Messages'}</h2>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs" title={live ? (pt?'Mensagens em tempo real':'Live messaging') : (pt?'Sincronização automática':'Automatic syncing')}><span aria-hidden="true" className={cn('size-1.5 rounded-full',live?'bg-emerald-500':'bg-muted-foreground')}/>{live ? (pt?'Ao vivo':'Live') : '1:1'}</span>
        </div>
        <div className="relative"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"/>
          <Input value={search} onChange={e=>setSearch(e.target.value)} aria-label={pt?'Buscar pessoas e conversas':'Search people and chats'}
            placeholder={pt?'Nome ou @usuário':'Name or @username'} className="h-11 pl-9 text-base" /></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {error && <div role="alert" className="m-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}
          <Button className="ml-2" size="sm" variant="outline" onClick={()=>void loadThreads().catch(()=>{})}>{pt?'Repetir':'Retry'}</Button>
        </div>}
        {loading && <p className="p-4 text-sm text-muted-foreground">{pt?'Carregando conversas…':'Loading conversations…'}</p>}
        {search.trim().length>=2 && <>
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">{pt?'Pessoas':'People'} {searching?'…':''}</div>
          {people.map(person=><button type="button" key={person.handle} disabled={busy}
            onClick={()=>void startPerson(person.handle)} className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-accent disabled:opacity-50">
            <UserAvatar name={person.displayName} image={person.avatarUrl} size="sm"/>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{person.displayName}</span>
              <span className="block truncate text-xs text-muted-foreground">@{person.handle}</span></span>
            <UserPlus className="size-4 text-muted-foreground"/>
          </button>)}
        </>}
        {visibleThreads.map(thread=><button type="button" key={thread.id} onClick={()=>openThread(thread.id)}
          className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-accent',
            activeId===thread.id && 'bg-accent/50')} aria-current={activeId===thread.id?'true':undefined}>
          <UserAvatar name={thread.peerName} image={thread.peerAvatarUrl} size="sm"/>
          <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold">{thread.peerName}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(thread.lastAt,locale)}</span>
          </span><span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {thread.lastBody ? (thread.lastAuthorId===myId ? (pt?'Você: ':'You: '):'')+thread.lastBody : '@'+thread.peerHandle}
            </span>
            {thread.unreadCount>0 && <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{thread.unreadCount>99?'99+':thread.unreadCount}</span>}
          </span></span>
        </button>)}
        {!loading && !visibleThreads.length && search.trim().length<2 && <div className="px-5 py-14 text-center">
          <MessageCircle className="mx-auto size-9 text-primary"/><h3 className="mt-3 font-semibold">{pt?'Comece uma conversa':'Start a conversation'}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{pt?'Pesquise uma pessoa pelo nome ou @usuário.':'Search people by name or @username.'}</p>
        </div>}
      </div>
    </section>
    <section aria-label={pt?'Conversa individual':'Direct message'} className={cn(
      'h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden',mobileOpened?'flex':'hidden md:flex'
    )}>
      {active ? <>
        <div data-uorqui-context-header className="relative z-20 flex h-16 min-h-16 shrink-0 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={()=>setMobileOpened(false)} aria-label={pt?'Voltar às conversas':'Back to chats'}><ArrowLeft className="size-5"/></Button>
          <UserAvatar name={active.peerName} image={active.peerAvatarUrl} size="sm"/>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{active.peerName}</p>
            <p className="truncate text-xs text-muted-foreground">@{active.peerHandle}</p></div>
        </div>
        <div ref={scrollBox} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            {messages.length===0 && <p className="my-12 text-center text-sm text-muted-foreground">{pt?'Envie a primeira mensagem.':'Send the first message.'}</p>}
            {messages.map(message=>{
              const mine=message.authorId===myId;
              return <div key={message.id} className={cn('flex',mine?'justify-end':'justify-start')}>
                <div className={cn('max-w-[86%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[75%]',
                  mine?'rounded-br-sm bg-primary text-primary-foreground':'rounded-bl-sm bg-card text-foreground ring-1 ring-border')}>
                  <p>{message.body}</p>
                  <div className={cn('mt-1 flex items-center justify-end gap-1 text-[10px]',mine?'text-primary-foreground/75':'text-muted-foreground')}>
                    {formatTime(message.createdAt,locale)}
                    {mine && <span title={message.readAt ? (pt?'Lida':'Read') : (pt?'Enviada':'Sent')} className="flex items-center">
                      {message.readAt?<CheckCheck className="size-3.5"/>:<span>✓</span>}
                    </span>}
                  </div>
                </div>
              </div>;
            })}
          </div>
        </div>
        <div className="shrink-0 border-t border-border bg-card/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {chatError && <p role="alert" className="mb-2 text-xs text-destructive">{chatError}</p>}
          <form onSubmit={e=>void send(e)} className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea rows={1} value={draft} onChange={e=>onDraftChange(e.target.value)} onKeyDown={onKeyDown}
              aria-label={pt?'Escrever mensagem':'Write message'} maxLength={4000}
              placeholder={pt?'Digite uma mensagem…':'Write a message…'}
              className="max-h-36 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
            <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label={pt?'Enviar mensagem':'Send message'}
              className="size-11 shrink-0"><Send className="size-5"/></Button>
          </form>
        </div>
      </> : <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
        <MessageCircle className="size-10 text-primary"/>
        <h3 className="font-semibold">{pt?'Selecione uma conversa':'Select a conversation'}</h3>
        <p className="max-w-xs text-sm text-muted-foreground">{pt?'Busque uma pessoa ou abra uma conversa existente.':'Find someone or open an existing conversation.'}</p>
        {mobileOpened && <Button variant="outline" onClick={()=>setMobileOpened(false)}><X className="size-4"/>{pt?'Voltar':'Back'}</Button>}
      </div>}
    </section>
  </div>;
}
