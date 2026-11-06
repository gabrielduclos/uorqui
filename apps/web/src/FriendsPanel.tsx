import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, MessageCircle, Search, UserPlus, Users, X, UserRoundX } from 'lucide-react';
import { UserAvatar } from './UserProfiles';
import { navigateToPublicProfile } from './publicProfileNavigation';
import { useUorquiPreferences } from './UorquiPreferences';
import { Button } from '@/components/ui/button';
import { BlockedAccountsPanel } from './BlockedAccountsPanel';
import { clearProfileImageCache } from './profileImageCache';
import { Input } from '@/components/ui/input';
import { WorkspaceContentLoading } from './ui-kit/WorkspaceContentLoading';

type Friend = { handle: string; displayName: string; avatarUrl: string | null; requestedAt?: string };
type FriendList = { friends: Friend[]; received: Friend[]; sent: Friend[] };
type Tab = 'friends' | 'received' | 'sent' | 'blocked';

async function friendsRequest(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
  if(!response.ok)throw new Error('HTTP_'+response.status);
  return response;
}

export function FriendsPanel({ onMessage, onBack, busy }: { onMessage: (handle:string)=>Promise<void>; onBack?:()=>void; busy?: boolean }) {
  const { locale } = useUorquiPreferences();
  const pt=locale==='pt-BR';
  const [list,setList]=useState<FriendList>({friends:[],received:[],sent:[]});
  const [tab,setTab]=useState<Tab>('friends');
  const [search,setSearch]=useState('');
  const [query,setQuery]=useState('');
  const [results,setResults]=useState<Friend[]>([]);
  const [adding,setAdding]=useState(false);
  const [loading,setLoading]=useState(true);
  const [searching,setSearching]=useState(false);
  const [pending,setPending]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const refresh=useCallback(async()=>{
    const r=await friendsRequest('/api/v1/friends');
    const data=await r.json() as FriendList;
    setList(data);
    setLoading(false);
    return data;
  },[]);
  useEffect(()=>{
    let active=true;
    void refresh().catch(()=>{if(active){setLoading(false);setError(pt?'Não foi possível carregar seus contatos.':'Could not load your contacts.');}});
    const update=()=>{clearProfileImageCache();void refresh().catch(()=>{});};
    const focus=()=>void refresh().catch(()=>{});
    window.addEventListener('uorqui:friends-updated',update);
    window.addEventListener('focus',focus);
    const stream=new EventSource('/api/v1/dm/events',{withCredentials:true});
    const changed=(event:Event)=>{
      try{const data=JSON.parse((event as MessageEvent).data) as {kind?:string};
        if(data.kind==='friendship-update')update();
      }catch{}
    };
    stream.addEventListener('dm-update',changed);
    return ()=>{active=false;stream.close();window.removeEventListener('uorqui:friends-updated',update);window.removeEventListener('focus',focus);};
  },[refresh,pt]);

  useEffect(()=>{
    const q=query.trim();
    if(!adding || q.length<2){setResults([]);setSearching(false);return;}
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{
      setSearching(true);
      void friendsRequest('/api/v1/dm/people?q='+encodeURIComponent(q),{signal:controller.signal})
        .then(r=>r.json() as Promise<{people:Friend[]}>)
        .then(data=>{if(!controller.signal.aborted)setResults(data.people);})
        .catch(()=>{if(!controller.signal.aborted)setResults([]);})
        .finally(()=>{if(!controller.signal.aborted)setSearching(false);});
    },300);
    return ()=>{controller.abort();window.clearTimeout(timer);};
  },[adding,query]);

  async function action(handle:string,kind:'request'|'accept'|'decline'|'remove'){
    if(pending)return;
    setPending(handle);setError('');setNotice('');
    const path=kind==='request'?'/api/v1/friends/requests'
      :kind==='remove'?'/api/v1/friends/'+encodeURIComponent(handle)
      :'/api/v1/friends/requests/'+encodeURIComponent(handle)+'/'+kind;
    const options:RequestInit=kind==='remove'?{method:'DELETE'}:kind==='request'
      ?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle})}
      :{method:'POST'};
    try{
      await friendsRequest(path,options);
      await refresh();
      window.dispatchEvent(new Event('uorqui:friends-updated'));
      setNotice(kind==='request'?(pt?'Solicitação enviada.':'Contact request sent.')
        :kind==='accept'?(pt?'Contato adicionado.':'Contact added.')
        :kind==='decline'?(pt?'Solicitação recusada.':'Request declined.')
        :(pt?'Contato removido.':'Contact removed.'));
    }catch(e){
      const code=e instanceof Error?e.message:'';
      setError(code==='HTTP_429'
        ?(pt?'Limite ou intervalo de solicitações atingido. Tente mais tarde.':'Request rate limit or cooldown reached.')
        :code==='HTTP_409'
        ?(pt?'Já existe uma solicitação ou o limite de contatos foi atingido.':'A request already exists or the contact limit was reached.')
        :(pt?'Não foi possível atualizar o contato.':'Could not update contact.'));
    }finally{setPending(null);}
  }
  const pendingSet=new Set([...list.friends,...list.received,...list.sent].map(p=>p.handle));
  const visible=(tab==='blocked'?[]:list[tab]).filter(p=>(p.displayName+' '+p.handle).toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));
  const labels:Record<Tab,string>=pt?{friends:'Contatos',received:'Recebidos',sent:'Enviados',blocked:'Bloqueados'}:{friends:'Contacts',received:'Received',sent:'Sent',blocked:'Blocked'};

  const item=(person:Friend,kind:Tab)=> <div key={person.handle}
    className="flex min-h-16 min-w-0 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60">
    <UserAvatar name={person.displayName} image={person.avatarUrl} size="sm"/>
    <a href={'/@'+person.handle} onClick={event=>navigateToPublicProfile(event,person.handle)}
      className="min-w-0 flex-1 rounded-md focus-visible:outline-2 focus-visible:outline-ring">
      <span className="block truncate text-sm font-semibold">{person.displayName}</span>
      <span className="block truncate text-xs text-muted-foreground">@{person.handle}</span>
    </a>
    {kind==='friends'?<>
      <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={()=>void onMessage(person.handle)}
        aria-label={pt?'Conversar com '+person.displayName:'Message '+person.displayName}
        className="size-9 shrink-0 text-primary"><MessageCircle className="size-4"/></Button>
      <Button type="button" size="icon" variant="ghost" disabled={!!pending} onClick={()=>void action(person.handle,'remove')}
        aria-label={pt?'Remover contato '+person.displayName:'Remove contact '+person.displayName}
        className="size-9 shrink-0 text-muted-foreground"><UserRoundX className="size-4"/></Button>
    </>:kind==='received'?<>
      <Button type="button" size="icon" variant="ghost" disabled={!!pending} onClick={()=>void action(person.handle,'accept')}
        aria-label={pt?'Aceitar '+person.displayName:'Accept '+person.displayName}
        className="size-9 shrink-0 text-primary"><Check className="size-4"/></Button>
      <Button type="button" size="sm" variant="outline" disabled={!!pending} onClick={()=>void action(person.handle,'decline')}
        aria-label={pt?'Recusar solicitação de '+person.displayName:'Decline request from '+person.displayName}
        className="h-9 shrink-0 gap-1 rounded-md px-2 text-xs"><X className="size-4"/>{pt?'Recusar':'Decline'}</Button>
    </>:<Button type="button" size="icon" variant="ghost" disabled={!!pending} onClick={()=>void action(person.handle,'remove')}
      aria-label={pt?'Cancelar solicitação para '+person.displayName:'Cancel request to '+person.displayName}
      className="size-9 shrink-0 text-muted-foreground"><X className="size-4"/></Button>}
  </div>;

  return <div data-uorqui-contacts data-uorqui-workspace-surface className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <header className="shrink-0 border-b border-border bg-card/95 px-4 py-3 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
        {onBack&&<Button type="button" size="icon" variant="ghost"
          aria-label={pt?'Voltar às mensagens':'Back to messages'} onClick={onBack}
          className="size-9 shrink-0 rounded-md"><ArrowLeft className="size-5"/></Button>}
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold tracking-tight">{pt?'Contatos':'Contacts'}</h1>
          <p className="text-[11px] text-muted-foreground">{pt?'Pessoas e solicitações':'People and requests'}</p>
        </div>
        <Button type="button" size="sm" variant={adding?'secondary':'outline'}
          className="min-h-9 shrink-0 gap-2 rounded-md px-3 text-xs font-medium"
          onClick={()=>{setAdding(v=>!v);setSearch('');setQuery('');setError('');setNotice('');}}>
          {adding?<X className="size-4"/>:<UserPlus className="size-4"/>}
          {adding?(pt?'Fechar':'Close'):(pt?'Adicionar':'Add')}
        </Button>
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5">
        {error&&<p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}
        {notice&&<p role="status" className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-primary">{notice}</p>}
        {adding?<section aria-label={pt?'Adicionar contato':'Add contact'} className="space-y-4">
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <label htmlFor="friend-handle" className="block text-xs font-semibold">{pt?'Solicitar contato por @usuário':'Request contact by @username'}</label>
            <form className="flex min-w-0 gap-2" onSubmit={event=>{event.preventDefault();const handle=query.trim().replace(/^@/,'').toLowerCase();if(/^[a-z][a-z0-9_]{2,31}$/.test(handle))void action(handle,'request');}}>
              <Input id="friend-handle" value={query} onChange={e=>setQuery(e.target.value)} maxLength={40}
                className="h-10 min-w-0 flex-1 rounded-md bg-background text-base md:text-sm" placeholder="@usuario" />
              <Button type="submit" size="sm" className="min-h-10 shrink-0 gap-1 rounded-md px-3 text-xs"
                disabled={!!pending||!/^[a-z][a-z0-9_]{2,31}$/.test(query.trim().replace(/^@/,'').toLowerCase())}>
                <UserPlus className="size-4"/>{pt?'Solicitar':'Request'}
              </Button>
            </form>
            <p className="text-xs leading-5 text-muted-foreground">{pt?
              'Perfis privados não aparecem na busca. Use o @usuário exato para enviar uma solicitação.':
              'Private profiles are not searchable. Enter the exact @username to send a request.'}</p>
          </div>
          {searching&&<p role="status" className="text-xs text-muted-foreground">{pt?'Buscando perfis públicos…':'Searching public profiles…'}</p>}
          {query.trim().length>=2&&results.length>0&&<div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-card">
            {results.map(person=><div key={person.handle} className="flex min-h-16 min-w-0 items-center gap-3 px-3 py-2 hover:bg-accent/60">
              <UserAvatar name={person.displayName} image={person.avatarUrl} size="sm"/>
              <a href={'/@'+person.handle} onClick={e=>navigateToPublicProfile(e,person.handle)}
                className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{person.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">@{person.handle}</span></a>
              <Button type="button" size="sm" variant="outline" disabled={!!pending||pendingSet.has(person.handle)}
                className="min-h-9 shrink-0 gap-1 rounded-md px-2 text-xs"
                onClick={()=>void action(person.handle,'request')}>
                {pendingSet.has(person.handle)?<Check className="size-4"/>:<UserPlus className="size-4"/>}
                {pendingSet.has(person.handle)?(pt?'Adicionado':'Added'):(pt?'Solicitar':'Request')}
              </Button>
            </div>)}
          </div>}
        </section>:<>
          <div className="grid grid-cols-4 gap-1 rounded-md border border-border bg-card p-1"
            role="tablist" aria-label={pt?'Listas de contatos':'Contact lists'}>
            {(['friends','received','sent','blocked'] as const).map(kind=><button key={kind} type="button" role="tab"
              aria-selected={tab===kind} onClick={()=>{setTab(kind);setSearch('');setNotice('');}}
              className={'flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium transition-colors sm:text-xs '+
                (tab===kind?'bg-secondary text-foreground':'text-muted-foreground hover:bg-accent hover:text-foreground')}>
              <span className="truncate">{labels[kind]}</span>
              {kind!=='blocked'&&list[kind].length>0&&<span className="shrink-0 rounded bg-primary/10 px-1 text-[10px] text-primary">{list[kind].length}</span>}
            </button>)}
          </div>
          {tab==='blocked'?<BlockedAccountsPanel/>:<>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
              <Input value={search} onChange={e=>setSearch(e.target.value)}
                className="h-10 rounded-md bg-card pl-9 text-base md:text-sm"
                aria-label={pt?'Pesquisar contatos':'Search contacts'}
                placeholder={pt?'Pesquisar por nome ou @usuário':'Search by name or @username'}/>
            </div>
            {loading&&<WorkspaceContentLoading rows={3} label={pt?'Carregando contatos':'Loading contacts'}/>}
            {!loading&&(visible.length?<div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-card">
              {visible.map(person=>item(person,tab))}
            </div>:<div className="rounded-lg border border-border bg-card px-4 py-12 text-center">
              <Users className="mx-auto size-8 text-muted-foreground"/>
              <h2 className="mt-3 text-sm font-semibold">
                {tab==='friends'?(pt?'Nenhum contato ainda':'No contacts yet'):tab==='received'?(pt?'Nenhuma solicitação recebida':'No incoming requests'):(pt?'Nenhuma solicitação enviada':'No sent requests')}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                {pt?'O contato é adicionado quando a solicitação é aceita.':'A contact is added when the request is accepted.'}
              </p>
            </div>)}
          </>}
        </>}
      </div>
    </div>
  </div>;
}
