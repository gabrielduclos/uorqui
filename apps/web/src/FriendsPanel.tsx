import { useCallback, useEffect, useState } from 'react';
import { Check, MessageCircle, Search, UserPlus, Users, X, UserRoundCheck, UserRoundX } from 'lucide-react';
import { UserAvatar } from './UserProfiles';
import { navigateToPublicProfile } from './publicProfileNavigation';
import { useUorquiPreferences } from './UorquiPreferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Friend = { handle: string; displayName: string; avatarUrl: string | null; requestedAt?: string };
type FriendList = { friends: Friend[]; received: Friend[]; sent: Friend[] };
type Tab = 'friends' | 'received' | 'sent';

async function friendsRequest(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
  if(!response.ok)throw new Error('HTTP_'+response.status);
  return response;
}

export function FriendsPanel({ onMessage, busy }: { onMessage: (handle:string)=>Promise<void>; busy?: boolean }) {
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
    void refresh().catch(()=>{if(active){setLoading(false);setError(pt?'Não foi possível carregar suas amizades.':'Could not load your friends.');}});
    const update=()=>void refresh().catch(()=>{});
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
      setNotice(kind==='request'?(pt?'Solicitação enviada.':'Friend request sent.')
        :kind==='accept'?(pt?'Agora vocês são amigos.':'You are now friends.')
        :kind==='decline'?(pt?'Solicitação recusada.':'Request declined.')
        :(pt?'Contato removido.':'Friend removed.'));
    }catch(e){
      const code=e instanceof Error?e.message:'';
      setError(code==='HTTP_429'
        ?(pt?'Limite ou intervalo de solicitações atingido. Tente mais tarde.':'Request rate limit or cooldown reached.')
        :code==='HTTP_409'
        ?(pt?'Já existe uma solicitação ou o limite de amigos foi atingido.':'A request already exists or the friend limit was reached.')
        :(pt?'Não foi possível atualizar a amizade.':'Could not update friendship.'));
    }finally{setPending(null);}
  }
  const pendingSet=new Set([...list.friends,...list.received,...list.sent].map(p=>p.handle));
  const visible=list[tab].filter(p=>(p.displayName+' '+p.handle).toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));
  const labels:Record<Tab,string>=pt?{friends:'Amigos',received:'Recebidos',sent:'Enviados'}:{friends:'Friends',received:'Received',sent:'Sent'};

  const item=(person:Friend,kind:Tab)=> <div key={person.handle} className="flex min-h-[66px] items-center gap-2 rounded-xl px-2 py-2 hover:bg-secondary/60">
    <UserAvatar name={person.displayName} image={person.avatarUrl} size="sm"/>
    <a href={'/@'+person.handle} onClick={event=>navigateToPublicProfile(event,person.handle)}
      className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
      <span className="block truncate text-sm font-semibold">{person.displayName}</span>
      <span className="block truncate text-xs text-muted-foreground">@{person.handle}</span>
    </a>
    {kind==='friends'?<>
      <button type="button" disabled={busy} onClick={()=>void onMessage(person.handle)}
        aria-label={pt?'Conversar com '+person.displayName:'Message '+person.displayName}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-primary hover:bg-secondary disabled:opacity-50">
        <MessageCircle className="size-4"/>
      </button>
      <button type="button" disabled={!!pending} onClick={()=>void action(person.handle,'remove')}
        aria-label={pt?'Desfazer amizade com '+person.displayName:'Unfriend '+person.displayName}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-50">
        <UserRoundX className="size-4"/>
      </button>
    </>:kind==='received'?<>
      <button type="button" disabled={!!pending} onClick={()=>void action(person.handle,'accept')}
        aria-label={pt?'Aceitar '+person.displayName:'Accept '+person.displayName}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-primary hover:bg-primary/10 disabled:opacity-50"><Check className="size-4"/></button>
      <button type="button" disabled={!!pending} onClick={()=>void action(person.handle,'decline')}
        aria-label={pt?'Recusar '+person.displayName:'Decline '+person.displayName}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-50"><X className="size-4"/></button>
    </>:<button type="button" disabled={!!pending} onClick={()=>void action(person.handle,'remove')}
      aria-label={pt?'Cancelar solicitação para '+person.displayName:'Cancel request to '+person.displayName}
      className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-secondary disabled:opacity-50"><X className="size-4"/></button>}
  </div>;

  return <div className="space-y-3 px-1 pb-6">
    <div className="flex items-center justify-between gap-2 px-2">
      <div><h3 className="text-sm font-semibold">{pt?'Amizades':'Friends'}</h3>
        <p className="text-xs text-muted-foreground">{pt?'Pedidos e contatos mútuos':'Requests and mutual friends'}</p></div>
      <Button size="sm" variant={adding?'outline':'secondary'}
        onClick={()=>{setAdding(v=>!v);setSearch('');setQuery('');setError('');setNotice('');}}>
        {adding?<X className="size-4"/>:<UserPlus className="size-4"/>}
        {adding?(pt?'Fechar':'Close'):(pt?'Adicionar':'Add')}
      </Button>
    </div>
    {error&&<p role="alert" className="mx-2 rounded-lg border border-destructive/30 p-3 text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="mx-2 text-xs text-primary">{notice}</p>}
    {adding?<div className="space-y-3">
      <div className="px-2">
        <label htmlFor="friend-handle" className="text-xs font-semibold">{pt?'Solicitar por @usuário (inclusive privado)':'Request by @username (including private)'}</label>
        <form className="mt-1 flex gap-2" onSubmit={event=>{event.preventDefault();const handle=query.trim().replace(/^@/,'').toLowerCase();if(/^[a-z][a-z0-9_]{2,31}$/.test(handle))void action(handle,'request');}}>
          <Input id="friend-handle" value={query} onChange={e=>setQuery(e.target.value)} maxLength={40}
            className="h-10 min-w-0 flex-1 rounded-lg text-base" placeholder="@usuario" />
          <Button type="submit" size="sm" disabled={!!pending||!/^[a-z][a-z0-9_]{2,31}$/.test(query.trim().replace(/^@/,'').toLowerCase())}>
            <UserPlus className="size-4"/>{pt?'Solicitar':'Request'}
          </Button>
        </form>
      </div>
      {searching&&<p role="status" className="px-3 text-xs text-muted-foreground">{pt?'Buscando perfis públicos…':'Searching public profiles…'}</p>}
      {query.trim().length>=2 && results.map(person=><div key={person.handle} className="flex min-h-14 items-center gap-2 rounded-xl px-2 hover:bg-secondary/60">
        <UserAvatar name={person.displayName} image={person.avatarUrl} size="sm"/>
        <a href={'/@'+person.handle} onClick={e=>navigateToPublicProfile(e,person.handle)}
          className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{person.displayName}</span>
          <span className="block truncate text-xs text-muted-foreground">@{person.handle}</span></a>
        <Button size="sm" variant="outline" disabled={!!pending||pendingSet.has(person.handle)}
          onClick={()=>void action(person.handle,'request')}>{pendingSet.has(person.handle)?<Check className="size-4"/>:<UserPlus className="size-4"/>}
          {pendingSet.has(person.handle)?(pt?'Adicionado':'Added'):(pt?'Solicitar':'Request')}</Button>
      </div>)}
      <p className="px-3 text-xs text-muted-foreground">{pt?'Perfis privados não aparecem na busca; use o @usuário exato para solicitar.':'Private profiles are not searchable; use the exact @username to request.'}</p>
    </div>:<>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary/70 p-1" role="tablist" aria-label={pt?'Listas de amizade':'Friendship lists'}>
        {(['friends','received','sent'] as const).map(kind=><button key={kind} type="button" role="tab" aria-selected={tab===kind}
          onClick={()=>{setTab(kind);setSearch('');setNotice('');}}
          className={'flex min-h-10 items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium '+(tab===kind?'bg-card shadow-sm':'text-muted-foreground hover:text-foreground')}>
          {labels[kind]} {list[kind].length>0&&<span className="rounded-md bg-primary/15 px-1 text-[10px] text-primary">{list[kind].length}</span>}
        </button>)}
      </div>
      <div className="relative px-1"><Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
        <Input value={search} onChange={e=>setSearch(e.target.value)} className="h-11 rounded-xl bg-background pl-9 text-base"
          aria-label={pt?'Pesquisar amigos':'Search friends'} placeholder={pt?'Pesquisar por nome ou @usuário':'Search by name or @username'}/>
      </div>
      {loading&&<p role="status" className="px-3 py-4 text-sm text-muted-foreground">{pt?'Carregando amizades…':'Loading friends…'}</p>}
      {!loading&&!visible.length&&<div className="px-4 py-10 text-center"><Users className="mx-auto size-9 text-primary"/>
        <h4 className="mt-3 text-sm font-semibold">{tab==='friends'?(pt?'Nenhum amigo ainda':'No friends yet'):tab==='received'?(pt?'Nenhuma solicitação recebida':'No incoming requests'):(pt?'Nenhuma solicitação enviada':'No sent requests')}</h4>
        <p className="mt-2 text-xs text-muted-foreground">{pt?'A amizade só é confirmada quando a solicitação é aceita.':'Friendship starts when a request is accepted.'}</p>
      </div>}
      {visible.map(person=>item(person,tab))}
    </>}
  </div>;
}
