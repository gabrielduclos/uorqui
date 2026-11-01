import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, Check, Compass, Hash, Headphones, LockKeyhole, MicOff, Plus, Search, Send, Smile, UserPlus, Users, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { UserAvatar } from './UserProfiles';
import { useUorquiPreferences } from './UorquiPreferences';
import CommunityVoiceRoom, { type CommunityVoiceParticipant } from './CommunityVoiceRoom';
import CommunityModerationPanel from './CommunityModerationPanel';
import CommunityMediaPicker, { isCommunityGifUrl } from './CommunityMediaPicker';
import CommunityMessageReactions, { type CommunityReaction } from './CommunityMessageReactions';

type Visibility='public'|'approval'|'private';
type Community={
  id:string;name:string;slug:string;description:string|null;avatarUrl:string|null;visibility:Visibility;
  memberCount:number;myRole:string|null;requestKind:string|null;requestStatus:string|null;
};
type Channel={id:string;name:string;kind:'text'|'voice';createdAt:string};
type Pending={handle:string;displayName:string;requestedAt:string};
type Detail={community:Community;channels:Channel[];pendingRequests:Pending[]};
type Message={id:string;clientId:string;body:string|null;createdAt:string;authorHandle:string;authorName:string;authorAvatar:string|null;editedAt:string|null;deletedAt:string|null;canEdit:boolean;canDelete:boolean;canReact:boolean;reactions:CommunityReaction[]};
type PendingMessage=Message & {channelId:string;pending:'sending'|'failed'};
function isPendingMessage(value:Message|PendingMessage):value is PendingMessage { return 'pending' in value; }
const hidden='min-h-0 flex-1 overflow-y-auto overscroll-contain';
const allowedSlug=/^[a-z][a-z0-9-]{2,63}$/;

async function api<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
  if(!response.ok){
    const detail=await response.json().catch(()=>null) as {error?:string}|null;
    throw new Error(detail?.error??'HTTP_'+response.status);
  }
  if(response.status===204)return undefined as T;
  return response.json() as Promise<T>;
}
function body(value:unknown):RequestInit{
  return {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)};
}
function memberView(community:Community){return !!community.myRole;}
function manage(community:Community){return community.myRole==='owner'||community.myRole==='admin';}

export default function LiveCommunities({myId,onMobileOpenChange,initialCommunityId}:{myId:string;onMobileOpenChange?:(value:boolean)=>void;initialCommunityId?:string|null}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [list,setList]=useState<Community[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(initialCommunityId??null);
  const [detail,setDetail]=useState<Detail|null>(null);
  const [channelId,setChannelId]=useState<string|null>(null);
  const [channelOpen,setChannelOpen]=useState(false);
  const [voiceParticipants,setVoiceParticipants]=useState<CommunityVoiceParticipant[]>([]);
  const [discovery,setDiscovery]=useState(false);
  const [query,setQuery]=useState('');
  const [createOpen,setCreateOpen]=useState(false);
  const [createName,setCreateName]=useState('');
  const [createSlug,setCreateSlug]=useState('');
  const [slugTouched,setSlugTouched]=useState(false);
  const [createDescription,setCreateDescription]=useState('');
  const [createVisibility,setCreateVisibility]=useState<Visibility>('public');
  const [inviteLink,setInviteLink]=useState<{id:string;expiresAt:string}|null>(null);
  const [shareBusy,setShareBusy]=useState(false);
  const [shareNotice,setShareNotice]=useState('');
  const [shareOpen,setShareOpen]=useState(false);
  const [newChannelOpen,setNewChannelOpen]=useState(false);
  const [newChannelName,setNewChannelName]=useState('');
  const [newChannelKind,setNewChannelKind]=useState<'text'|'voice'>('text');
  const [inviteHandle,setInviteHandle]=useState('');
  const [messages,setMessages]=useState<Message[]>([]);
  const [pendingMessages,setPendingMessages]=useState<PendingMessage[]>([]);
  const [messagesLoading,setMessagesLoading]=useState(false);
  const [detailLoading,setDetailLoading]=useState(false);
  const [draft,setDraft]=useState('');
  const [mediaPicker,setMediaPicker]=useState<'emoji'|'gif'|null>(null);
  const [reactionPickerId,setReactionPickerId]=useState<string|null>(null);
  const [reactionBusyId,setReactionBusyId]=useState<string|null>(null);
  const reactionSubmitting=useRef<string|null>(null);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editingBody,setEditingBody]=useState('');
  const [deletingId,setDeletingId]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [busyAction,setBusyAction]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const scrollRef=useRef<HTMLDivElement>(null);
  const previousLastMessage=useRef<string|null>(null);
  const activeChannel=detail?.channels.find(x=>x.id===channelId)??null;
  const community=detail?.community??null;
  const renderedMessages=[...messages,...pendingMessages.filter(p=>p.channelId===channelId&&!messages.some(m=>m.clientId===p.clientId))];

  const loadList=useCallback(async()=>{
    const data=await api<{communities:Community[]}>('/api/v1/communities');
    setList(data.communities);setLoading(false);
    return data.communities;
  },[]);
  const loadDetail=useCallback(async(id:string)=>{
    const data=await api<Detail>('/api/v1/communities/'+encodeURIComponent(id));
    setDetail(data);
    setChannelId(old=>old&&data.channels.some(channel=>channel.id===old)?old:data.channels[0]?.id??null);
    return data;
  },[]);
  useEffect(()=>{
    let active=true;
    void loadList().then(groups=>{
      if(!active)return;
      if(!groups.some(group=>group.myRole))setDiscovery(true);
      const first=groups.find(group=>group.myRole);
      if(initialCommunityId&&groups.some(g=>g.id===initialCommunityId&&g.myRole))setSelectedId(initialCommunityId);
      else if(first)setSelectedId(first.id);
    }).catch(()=>{if(active){setLoading(false);setError(pt?'Não foi possível carregar as comunidades.':'Could not load communities.');}});
    return ()=>{active=false;};
  },[loadList,pt]);
  useEffect(()=>{
    if(!selectedId){setDetail(null);setChannelId(null);return;}
    let active=true;setDetail(null);setDetailLoading(true);
    void loadDetail(selectedId).catch(()=>{if(active)setError(pt?'Não foi possível abrir a comunidade.':'Could not open community.');}).finally(()=>{if(active)setDetailLoading(false);});
    return ()=>{active=false;};
  },[selectedId,loadDetail,pt]);
  useEffect(()=>onMobileOpenChange?.(channelOpen),[channelOpen,onMobileOpenChange]);
  useEffect(()=>{if(initialCommunityId){setSelectedId(initialCommunityId);setDiscovery(false);void loadList();}},[initialCommunityId,loadList]);
  async function shareCommunity(){
    if(!selectedId)return;
    setShareBusy(true);setShareNotice('');
    try{
      const existing=await api<{link:{id:string;expiresAt:string}|null}>('/api/v1/communities/'+selectedId+'/share');
      if(!existing.link&&manage(community!)){
        const made=await api<{link:{id:string;expiresAt:string}}>('/api/v1/communities/'+selectedId+'/share',body({}));
        setInviteLink(made.link);
      }else setInviteLink(existing.link);
      setShareOpen(true);
    }catch{setShareNotice(pt?'Não foi possível carregar o convite.':'Could not load invitation.');}
    finally{setShareBusy(false);}
  }
  async function copyInvite(){
    if(!inviteLink)return;
    try{await navigator.clipboard.writeText(window.location.origin+'/invite/'+inviteLink.id);
      setShareNotice(pt?'Link copiado!':'Link copied!');}
    catch{setShareNotice(window.location.origin+'/invite/'+inviteLink.id);}
  }
  const closeChannel=()=>{setChannelOpen(false);setReactionPickerId(null);setMediaPicker(null);setDraft('');setMessages([]);setVoiceParticipants([]);setEditingId(null);setDeletingId(null);};

  useEffect(()=>{
    if(!selectedId||!channelId||activeChannel?.kind!=='text'||!community?.myRole){setMessages([]);return;}
    let active=true;
    previousLastMessage.current=null;
    setReactionPickerId(null);setMessages([]);setMessagesLoading(true);
    const poll=async()=>{
      try{
        const result=await api<{messages:Message[]}>(`/api/v1/communities/${selectedId}/channels/${channelId}/messages`);
        if(active){setMessages(result.messages);setPendingMessages(old=>old.filter(p=>p.channelId!==channelId||!result.messages.some(m=>m.clientId===p.clientId)));setMessagesLoading(false);}
      }catch{if(active){setMessagesLoading(false);setError(pt?'Não foi possível atualizar as mensagens.':'Could not refresh messages.');}}
    };
    void poll();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void poll();},5000);
    return ()=>{active=false;window.clearInterval(timer);};
  },[selectedId,channelId,activeChannel?.kind,community?.myRole,pt]);
  useEffect(()=>{
    const latest=messages.at(-1)?.id??null;
    if(latest&&latest!==previousLastMessage.current){
      const el=scrollRef.current;
      if(el&&(!previousLastMessage.current||el.scrollHeight-el.scrollTop-el.clientHeight<220))
        el.scrollTo({top:el.scrollHeight,behavior:previousLastMessage.current?'smooth':'instant'});
    }
    previousLastMessage.current=latest;
  },[messages]);

  async function refresh(id=selectedId){
    await loadList();
    if(id)await loadDetail(id);
  }
  async function act(run:()=>Promise<unknown>,success:string,id=selectedId,key='action'){
    if(busy)return;
    setBusy(true);setBusyAction(key);setError('');setNotice('');
    try{await run();await refresh(id);setNotice(success);}
    catch(reason){
      const err=reason instanceof Error?reason.message:'';
      setError(err==='SLUG_TAKEN'?(pt?'Este endereço já está em uso.':'This address is taken.')
        :err==='REQUEST_COOLDOWN'?(pt?'Você precisa aguardar antes de tentar novamente.':'Please wait before retrying.')
        :err==='CHANNEL_EXISTS'?(pt?'Já existe um canal com esse nome.':'Channel name already exists.')
        :err==='COMMUNITY_LIMIT'?(pt?'Limite de comunidades criadas atingido.':'Community creation limit reached.')
        :err==='OWNER_CANNOT_LEAVE'?(pt?'O proprietário não pode sair sem transferir a comunidade.':'Owners cannot leave without transferring ownership.')
        :(pt?'Não foi possível concluir a operação.':'Could not complete this operation.'));
    }finally{setBusy(false);setBusyAction(null);}
  }

  function selectCommunity(id:string){
    closeChannel();setSelectedId(id);setDiscovery(false);setCreateOpen(false);
    setError('');setNotice('');
  }
  async function create(event:FormEvent){
    event.preventDefault();
    if(!allowedSlug.test(createSlug)) {setError(pt?'Use um endereço com letras minúsculas, números ou hífens (3–64).':'Use a lowercase slug, numbers or hyphens (3–64).');return;}
    if(busy)return;
    setBusy(true);setBusyAction('create');setError('');
    try{
      const result=await api<{id:string}>('/api/v1/communities',body({
        name:createName.trim(),slug:createSlug.trim(),description:createDescription.trim(),visibility:createVisibility
      }));
      await loadList();
      selectCommunity(result.id);
      setCreateName('');setCreateSlug('');setSlugTouched(false);setCreateDescription('');
    }catch(reason){setError(reason instanceof Error&&reason.message==='SLUG_TAKEN'
      ?(pt?'Este endereço já pertence a uma comunidade.':'This slug already exists.')
      :(pt?'Falha ao criar comunidade.':'Could not create community.'));}
    finally{setBusy(false);setBusyAction(null);}
  }
  async function createChannel(event:FormEvent){
    event.preventDefault();
    if(!selectedId||!newChannelName.trim())return;
    await act(()=>api('/api/v1/communities/'+selectedId+'/channels',body({name:newChannelName.trim(),kind:newChannelKind})),
      pt?'Canal criado.':'Channel created.',selectedId,'createChannel');
    setNewChannelOpen(false);setNewChannelName('');
  }
  async function invite(event:FormEvent){
    event.preventDefault();
    if(!selectedId)return;
    const handle=inviteHandle.trim().replace(/^@/,'').toLowerCase();
    if(!/^[a-z][a-z0-9_]{2,31}$/.test(handle)){setError(pt?'Digite um @usuário válido.':'Enter a valid @username.');return;}
    await act(()=>api('/api/v1/communities/'+selectedId+'/invite',body({handle})),
      pt?'Convite enviado.':'Invitation sent.',selectedId,'inviteUser');
    setInviteHandle('');
  }
  async function submitPending(p:PendingMessage){
    const currentCommunity=selectedId;
    try{
      await api('/api/v1/communities/'+currentCommunity+'/channels/'+p.channelId+'/messages',
        body({clientId:p.clientId,body:p.body}));
      // Only refresh the currently visible channel. Keep pending entry until the
      // server's message list contains this clientId (prevents flashing/disappearing).
      if(channelId===p.channelId&&currentCommunity){
        const updated=await api<{messages:Message[]}>('/api/v1/communities/'+currentCommunity+'/channels/'+p.channelId+'/messages');
        setMessages(updated.messages);
        setPendingMessages(old=>old.filter(msg=>msg.clientId!==p.clientId || !updated.messages.some(m=>m.clientId===msg.clientId)));
      }
    }catch{
      setPendingMessages(old=>old.map(x=>x.clientId===p.clientId?{...x,pending:'failed'}:x));
    }
  }
  function queueText(text:string,clearDraft=false){
    const selected=channelId;
    if(!community?.myRole||!activeChannel||activeChannel.kind!=='text'||!selectedId||!selected||!text||text.length>4000)return;
    const clientId=crypto.randomUUID(),now=new Date().toISOString();
    const pending:PendingMessage={id:clientId,clientId,channelId:selected,body:text,createdAt:now,
      authorHandle:'',authorName:pt?'Você':'You',authorAvatar:null,editedAt:null,deletedAt:null,canEdit:false,canDelete:false,canReact:false,reactions:[],pending:'sending'};
    setPendingMessages(old=>[...old,pending]);
    if(clearDraft)setDraft('');
    setError('');
    window.requestAnimationFrame(()=>scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'}));
    void submitPending(pending);
  }
  function send(event?:FormEvent){
    event?.preventDefault();
    queueText(draft.trim(),true);
  }
  function retryPending(p:PendingMessage){
    setPendingMessages(old=>old.map(x=>x.clientId===p.clientId?{...x,pending:'sending'}:x));
    void submitPending({...p,pending:'sending'});
  }
  async function updateMessage(event:FormEvent){
    event.preventDefault();
    if(!selectedId||!channelId||!editingId||!editingBody.trim()||busy)return;
    setBusy(true);setError('');
    try{
      setBusyAction('editMessage');
      await api('/api/v1/communities/'+selectedId+'/channels/'+channelId+'/messages/'+editingId,{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:editingBody.trim()})
      });
      const updated=await api<{messages:Message[]}>(`/api/v1/communities/${selectedId}/channels/${channelId}/messages`);
      setMessages(updated.messages);setEditingId(null);setEditingBody('');
    }catch{setError(pt?'Não foi possível editar a mensagem.':'Could not edit message.');}
    finally{setBusy(false);setBusyAction(null);}
  }
  async function removeMessage(messageId:string){
    if(!selectedId||!channelId||busy)return;
    if(deletingId!==messageId){setDeletingId(messageId);return;}
    setBusy(true);setError('');
    try{
      setBusyAction('deleteMessage:'+messageId);
      await api('/api/v1/communities/'+selectedId+'/channels/'+channelId+'/messages/'+messageId,{method:'DELETE'});
      const updated=await api<{messages:Message[]}>(`/api/v1/communities/${selectedId}/channels/${channelId}/messages`);
      setMessages(updated.messages);setDeletingId(null);
    }catch{setError(pt?'Não foi possível cancelar a mensagem.':'Could not remove message.');}
    finally{setBusy(false);setBusyAction(null);}
  }
  async function toggleReaction(message:Message,emoji:string,mine:boolean){
    if(!selectedId||!channelId||!message.canReact||message.deletedAt||reactionSubmitting.current)return;
    const key=selectedId+'/'+channelId+'/'+message.id;
    reactionSubmitting.current=key;setReactionBusyId(message.id);setError('');
    try{
      const result=await api<{reactions:CommunityReaction[]}>(
        '/api/v1/communities/'+selectedId+'/channels/'+channelId+'/messages/'+message.id+'/reactions',{
          method:mine?'DELETE':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({emoji})
        });
      setMessages(old=>old.map(item=>item.id===message.id?{...item,reactions:result.reactions}:item));
      setReactionPickerId(null);
    }catch{
      setError(pt?'Não foi possível atualizar a reação.':'Could not update reaction.');
    }finally{
      reactionSubmitting.current=null;setReactionBusyId(null);
    }
  }
  function onComposerKeyDown(event:KeyboardEvent<HTMLTextAreaElement>){
    if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send();}
  }

  const owned=list.filter(group=>group.myRole);
  const available=list.filter(group=>group.visibility!=='private'||group.myRole||group.requestKind==='invite');
  const matches=available.filter(group=>(group.name+' '+group.slug).toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
  const visibilityLabel=(v:Visibility)=>v==='public'?(pt?'Pública':'Public'):v==='approval'?(pt?'Por aprovação':'Approval required'):(pt?'Privada':'Private');
  const communityIcon=(group:Community)=>group.name.trim().charAt(0).toUpperCase()||'C';
  const communityAvatar=(group:Community,classes:string)=>group.avatarUrl?
    <img src={group.avatarUrl} alt="" className={classes+' block min-h-0 min-w-0 object-cover'}/>:
    <span aria-hidden="true">{communityIcon(group)}</span>;

  return <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden">
    <nav data-uorqui-community-rail aria-label={pt?'Minhas comunidades':'My communities'}
      className={cn('relative z-20 w-16 shrink-0 flex-col items-center gap-3 overflow-y-auto overscroll-contain border-r border-border bg-card/95 py-4',
        channelOpen?'hidden md:flex':'flex')}>
      <button type="button" onClick={()=>{closeChannel();setDiscovery(true);setCreateOpen(false);}}
        title={pt?'Explorar comunidades':'Explore communities'} aria-label={pt?'Explorar comunidades':'Explore communities'}
        className={cn('grid size-11 shrink-0 place-items-center rounded-2xl border border-border text-primary hover:bg-secondary',discovery&&'bg-secondary ring-2 ring-primary/50')}>
        <Compass className="size-5"/></button>
      <div className="h-px w-8 shrink-0 bg-border"/>
      {owned.map(group=><button type="button" key={group.id} title={group.name}
        aria-label={group.name} aria-current={selectedId===group.id&&!discovery?'page':undefined}
        onClick={()=>selectCommunity(group.id)} className={cn('grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-primary/15 text-base font-semibold text-primary hover:bg-primary/25',selectedId===group.id&&!discovery&&'ring-2 ring-primary')}>
        {communityAvatar(group,'size-full rounded-2xl')}
      </button>)}
      <button type="button" onClick={()=>{closeChannel();setDiscovery(true);setCreateOpen(true);}}
        aria-label={pt?'Criar comunidade':'Create community'} title={pt?'Criar comunidade':'Create community'}
        className="grid size-11 shrink-0 place-items-center rounded-2xl border border-dashed border-primary/60 text-primary hover:bg-secondary">
        <Plus className="size-5"/>
      </button>
    </nav>

    <section aria-label={pt?'Comunidades e canais':'Communities and channels'}
      className={cn('h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-r border-border bg-card/25 md:flex md:w-72 md:shrink-0',channelOpen?'hidden':'flex')}>
      {discovery||!selectedId?<div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 space-y-3 border-b border-border bg-card/95 p-4">
          <h2 className="text-base font-semibold">{createOpen?(pt?'Criar comunidade':'Create community'):(pt?'Explorar comunidades':'Explore communities')}</h2>
          <Button className="w-full" size="sm" variant={createOpen?'outline':'secondary'}
            onClick={()=>{setCreateOpen(v=>!v);setError('');}}>{createOpen?<X className="size-4"/>:<Plus className="size-4"/>}
            {createOpen?(pt?'Fechar formulário':'Close form'):(pt?'Nova comunidade':'New community')}</Button>
        </div>
        <div className={hidden+' p-3'}>
          {createOpen?<form onSubmit={event=>void create(event)} className="space-y-3">
            <label className="block text-xs font-medium">{pt?'Nome':'Name'}
              <Input value={createName} onChange={e=>{setCreateName(e.target.value);if(!slugTouched)setCreateSlug(e.target.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-]+/g,'-').replace(/^-+/,'').slice(0,64));}}
                required minLength={2} maxLength={120} className="mt-1 text-base" placeholder={pt?'Minha comunidade':'My community'}/></label>
            <label className="block text-xs font-medium">{pt?'Endereço':'Slug'}
              <Input required value={createSlug} onChange={e=>{setSlugTouched(true);setCreateSlug(e.target.value.toLowerCase());}} maxLength={64}
                className="mt-1 text-base" placeholder="minha-comunidade"/></label>
            <label className="block text-xs font-medium">{pt?'Descrição':'Description'}
              <textarea value={createDescription} onChange={e=>setCreateDescription(e.target.value)} maxLength={500} rows={3}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"/></label>
            <label className="block text-xs font-medium">{pt?'Privacidade':'Visibility'}
              <select value={createVisibility} onChange={e=>setCreateVisibility(e.target.value as Visibility)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-2 text-base">
                <option value="public">{pt?'Pública (entrada livre)':'Public (open join)'}</option>
                <option value="approval">{pt?'Por aprovação':'Approval required'}</option>
                <option value="private">{pt?'Privada (somente convite)':'Private (invitation only)'}</option>
              </select></label>
            <Button type="submit" className="w-full" loading={busyAction==='create'} disabled={busy||createName.trim().length<2||!allowedSlug.test(createSlug)}>
              <Plus className="size-4"/>{pt?'Criar comunidade':'Create community'}</Button>
          </form>:<div className="space-y-2">
            <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/>
              <Input value={query} onChange={e=>setQuery(e.target.value)} className="h-10 pl-9 text-base" placeholder={pt?'Buscar comunidade':'Search communities'}/></div>
            {loading&&<SkeletonRows className="p-3" rows={5}/>}
            {matches.map(group=><button type="button" key={group.id} onClick={()=>selectCommunity(group.id)}
              className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-secondary">
              <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/15 font-bold text-primary">{communityAvatar(group,'size-full rounded-xl')}</div>
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{group.name}</strong>
                <span className="block truncate text-xs text-muted-foreground">{visibilityLabel(group.visibility)} · {group.memberCount} {pt?'membros':'members'}</span>
                {group.description&&<span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{group.description}</span>}</span>
            </button>)}
            {!loading&&!matches.length&&<p className="p-5 text-center text-sm text-muted-foreground">{pt?'Nenhuma comunidade encontrada.':'No communities found.'}</p>}
          </div>}
        </div>
      </div>:<>
        <div className="shrink-0 border-b border-border bg-card/95 p-4">
          {detailLoading?<div className="space-y-2"><Skeleton className="h-5 w-3/4"/><Skeleton className="h-3 w-1/2"/></div>:
          <div className="flex items-center gap-2">
            {community?.avatarUrl&&<div className="size-10 shrink-0 overflow-hidden rounded-xl"><img src={community.avatarUrl} alt="" className="block size-full object-cover"/></div>}
            <div className="min-w-0 flex-1 truncate text-base font-semibold">{community?.name??(pt?'Comunidade':'Community')}</div>
          </div>}
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{community?.description|| (community?visibilityLabel(community.visibility):'…')}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="size-3.5"/>{community?.memberCount??'…'} {pt?'membros':'members'}
            {community?.visibility==='private'&&<LockKeyhole className="size-3.5"/>}
          </div>
        </div>
        <div className={hidden+' space-y-4 p-3'}>
          {community&&!memberView(community)&&<div className="space-y-3 rounded-xl border border-border bg-card p-3">
            <p className="text-sm text-muted-foreground">{community.visibility==='private'?(pt?'Entrada apenas por convite.':'Invitation only.'):
              community.visibility==='approval'?(pt?'O responsável aprova a entrada.':'A manager approves requests.'):(pt?'Entre para acessar os canais.':'Join to access channels.')}</p>
            {community.requestKind==='invite'&&community.requestStatus==='pending'?<div className="flex flex-wrap gap-2">
              <Button size="sm" loading={busyAction==='acceptInvite'} disabled={busy} onClick={()=>void act(()=>api('/api/v1/communities/'+community.id+'/invite/accept',{method:'POST'}),pt?'Convite aceito.':'Invitation accepted.',community.id,'acceptInvite')}><Check className="size-4"/>{pt?'Aceitar convite':'Accept invite'}</Button>
              <Button size="sm" variant="outline" loading={busyAction==='declineInvite'} disabled={busy} onClick={()=>void act(()=>api('/api/v1/communities/'+community.id+'/invite/decline',{method:'POST'}),pt?'Convite recusado.':'Invitation declined.',community.id,'declineInvite')}><X className="size-4"/>{pt?'Recusar':'Decline'}</Button>
            </div>:community.requestKind==='join'&&community.requestStatus==='pending'?
              <p className="text-xs font-medium text-primary">{pt?'Solicitação pendente':'Request pending'}</p>:
              community.visibility!=='private'&&<Button size="sm" loading={busyAction==='joinCommunity'} disabled={busy} onClick={()=>void act(()=>api('/api/v1/communities/'+community.id+'/join',{method:'POST'}),pt?'Solicitação registrada ou entrada concluída.':'Joined or request submitted.',community.id,'joinCommunity')}>
                <UserPlus className="size-4"/>{community.visibility==='approval'?(pt?'Solicitar entrada':'Request to join'):(pt?'Entrar':'Join')}</Button>}
          </div>}
          {community&&memberView(community)&&<>
            <section><p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{pt?'Canais de texto':'Text channels'}</p>
              {detail?.channels.filter(ch=>ch.kind==='text').map(ch=><button type="button" key={ch.id}
                onClick={()=>{setVoiceParticipants([]);setMediaPicker(null);setChannelId(ch.id);setChannelOpen(true);setError('');}}
                className={cn('mb-1 flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-secondary',channelId===ch.id&&'bg-secondary font-semibold')}>
                <Hash className="size-4 shrink-0 text-muted-foreground"/><span className="truncate">{ch.name}</span></button>)}</section>
            <section><p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{pt?'Salas de voz':'Voice rooms'}</p>
              {detail?.channels.filter(ch=>ch.kind==='voice').map(ch=><div key={ch.id} className="mb-1">
                <button type="button" onClick={()=>{setVoiceParticipants([]);setMediaPicker(null);setChannelId(ch.id);setChannelOpen(true);setError('');}}
                  className={cn('flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-secondary',channelId===ch.id&&'bg-secondary font-semibold')}>
                  <Volume2 className="size-4 shrink-0 text-muted-foreground"/>
                  <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                  {channelId===ch.id&&voiceParticipants.length>0&&
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">{voiceParticipants.length}</span>}
                </button>
                {channelId===ch.id&&voiceParticipants.length>0&&<div className="ml-5 space-y-0.5 border-l border-border/70 py-1 pl-2">
                  {voiceParticipants.map(person=><div key={person.sessionId}
                    className="flex min-h-9 items-center gap-2 rounded-lg px-2 py-1 text-xs text-muted-foreground"
                    title={person.displayName}>
                    <div className={cn('rounded-full p-0.5',person.speaking&&'ring-2 ring-emerald-500 animate-pulse')}>
                      <UserAvatar name={person.displayName} image={person.avatarUrl} size="sm"/>
                    </div>
                    <span className="min-w-0 flex-1 truncate">{person.displayName}</span>
                    {person.deafened&&<VolumeX className="size-3.5 shrink-0 text-destructive" aria-label={pt?'Áudio desligado':'Audio disabled'}/>}
                    {person.muted&&<MicOff className="size-3.5 shrink-0 text-destructive" aria-label={pt?'Microfone silenciado':'Microphone muted'}/>}
                  </div>)}
                </div>}
              </div>)}</section>
            {manage(community)&&<section className="space-y-2 border-t border-border pt-3">
              <button type="button" className="flex w-full items-center gap-2 rounded-xl p-2 text-sm text-primary hover:bg-secondary"
                onClick={()=>setNewChannelOpen(v=>!v)}><Plus className="size-4"/>{pt?'Novo canal':'New channel'}</button>
              {newChannelOpen&&<form className="space-y-2" onSubmit={event=>void createChannel(event)}>
                <Input required value={newChannelName} onChange={e=>setNewChannelName(e.target.value)} maxLength={64}
                  className="text-base" placeholder={pt?'Nome do canal':'Channel name'}/>
                <select value={newChannelKind} onChange={e=>setNewChannelKind(e.target.value as 'text'|'voice')}
                  className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm">
                  <option value="text">{pt?'Texto':'Text'}</option><option value="voice">{pt?'Voz':'Voice'}</option>
                </select>
                <Button size="sm" type="submit" loading={busyAction==='createChannel'} disabled={busy||newChannelName.trim().length<2}>{pt?'Criar canal':'Create channel'}</Button>
              </form>}
              <form className="space-y-2 pt-2" onSubmit={event=>void invite(event)}>
                <label className="text-xs font-semibold">{pt?'Convidar pelo @usuário':'Invite by @username'}</label>
                <Input value={inviteHandle} onChange={e=>setInviteHandle(e.target.value)} maxLength={40} className="text-base" placeholder="@usuario"/>
                <Button size="sm" variant="outline" type="submit" loading={busyAction==='inviteUser'} disabled={busy||!inviteHandle.trim()}><UserPlus className="size-4"/>{pt?'Convidar':'Invite'}</Button>
              </form>
              {!!detail?.pendingRequests.length&&<div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold">{pt?'Pedidos de entrada':'Join requests'}</p>
                {detail.pendingRequests.map(person=><div key={person.handle} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs">{person.displayName} (@{person.handle})</span>
                  <Button size="sm" variant="outline" loading={busyAction==='approve:'+person.handle} disabled={busy} onClick={()=>void act(()=>api('/api/v1/communities/'+community.id+'/requests/'+person.handle+'/approve',{method:'POST'}),pt?'Membro aprovado.':'Member approved.',community.id,'approve:'+person.handle)}>
                    <Check className="size-4"/></Button>
                </div>)}
              </div>}
            </section>}
            <div className="space-y-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" className="w-full" loading={shareBusy} onClick={()=>void shareCommunity()}>
                {pt?'Compartilhar comunidade':'Share community'}</Button>
              {shareOpen&&<div className="space-y-2 rounded-xl border border-border p-2">
                {inviteLink?<><p className="break-all text-[11px] text-muted-foreground">{window.location.origin+'/invite/'+inviteLink.id}</p>
                <Button type="button" size="sm" className="w-full" onClick={()=>void copyInvite()}>{pt?'Copiar link':'Copy link'}</Button>
                {manage(community)&&<Button type="button" size="sm" variant="outline" disabled={shareBusy} onClick={()=>{
                  if(!selectedId)return;setShareBusy(true);
                  void api<{link:{id:string;expiresAt:string}}>('/api/v1/communities/'+selectedId+'/share',body({}))
                    .then(data=>{setInviteLink(data.link);setShareNotice(pt?'Novo link criado; o anterior foi revogado.':'New link created; previous link revoked.');})
                    .catch(()=>setShareNotice(pt?'Falha ao renovar.':'Could not rotate invitation.'))
                    .finally(()=>setShareBusy(false));
                }}>{pt?'Gerar novo link':'Rotate invitation link'}</Button>}
                {manage(community)&&<Button type="button" size="sm" variant="ghost" className="w-full" disabled={shareBusy} onClick={()=>{
                  if(!selectedId)return;setShareBusy(true);
                  void api('/api/v1/communities/'+selectedId+'/share',{method:'DELETE'})
                    .then(()=>{setInviteLink(null);setShareNotice(pt?'Link revogado.':'Invitation revoked.');})
                    .catch(()=>setShareNotice(pt?'Falha ao revogar.':'Could not revoke link.'))
                    .finally(()=>setShareBusy(false));
                }}>{pt?'Revogar link':'Revoke link'}</Button>}</>:
                  <p className="text-xs text-muted-foreground">{pt?'Peça a um administrador para gerar o link.':'Ask an administrator to create an invitation link.'}</p>}
              </div>}
              {shareNotice&&<p role="status" className="break-words text-xs text-muted-foreground">{shareNotice}</p>}
            </div>
            {['owner','admin','moderator'].includes(community.myRole??'')&&
              <CommunityModerationPanel id={community.id} role={community.myRole as 'owner'|'admin'|'moderator'|'member'}
                name={community.name} description={community.description} visibility={community.visibility} avatarUrl={community.avatarUrl}
                channels={detail?.channels??[]} onChanged={()=>refresh(community.id)}
                onDeleted={async()=>{closeChannel();setDetail(null);setSelectedId(null);setDiscovery(true);await loadList();}}/>}
            {community.myRole!=='owner'&&<Button variant="ghost" size="sm" className="w-full text-muted-foreground"
              loading={busyAction==='leaveCommunity'} disabled={busy} onClick={()=>void act(async()=>{
                await api('/api/v1/communities/'+community.id+'/membership',{method:'DELETE'});closeChannel();setDiscovery(true);setSelectedId(null);setDetail(null);
              },pt?'Você saiu da comunidade.':'You left the community.',null,'leaveCommunity')}>{pt?'Sair da comunidade':'Leave community'}</Button>}
          </>}
        </div>
      </>}
    </section>

    <section aria-label={pt?'Conteúdo da comunidade':'Community content'}
      className={cn('h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden',channelOpen?'flex':'hidden md:flex')}>
      {community&&memberView(community)&&activeChannel&&!discovery?<>
        <header data-uorqui-context-header className="relative z-20 flex h-16 min-h-16 shrink-0 items-center gap-3 border-b border-border bg-card/95 px-3 backdrop-blur sm:px-4">
          <Button type="button" size="icon" variant="ghost" className="md:hidden" aria-label={pt?'Voltar aos canais':'Back to channels'} onClick={closeChannel}>
            <ArrowLeft className="size-5"/></Button>
          {activeChannel.kind==='voice'?<Volume2 className="size-5 text-muted-foreground"/>:<Hash className="size-5 text-muted-foreground"/>}
          <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{activeChannel.name}</h2>
            <p className="truncate text-xs text-muted-foreground">{community.name}</p></div>
        </header>
        {activeChannel.kind==='voice'?(
          channelOpen?<CommunityVoiceRoom key={community.id+'/'+activeChannel.id}
            communityId={community.id} channelId={activeChannel.id} onParticipantsChange={setVoiceParticipants}/>:
          <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
            {pt?'Selecione uma sala para conectar o áudio.':'Select a voice room to connect audio.'}
          </div>
        ):<>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-3 py-4 sm:px-6">
            {!messages.length&&<div className="mx-auto my-12 max-w-md text-center"><Hash className="mx-auto size-9 text-primary"/>
              <h3 className="mt-3 font-semibold">{pt?'Comece a conversa em #':'Start the conversation in #'}{activeChannel.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{pt?'Mensagens salvas na comunidade, visíveis aos seus membros.':'Messages are saved to the community and visible to its members.'}</p>
            </div>}
            {messagesLoading&&<SkeletonRows rows={4} className="mb-5"/>}
            <div className="space-y-4">{renderedMessages.map(message=><div key={message.clientId} className="flex min-w-0 gap-3">
              <UserAvatar name={message.authorName} image={message.authorAvatar} size="sm"/>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2"><strong className="text-sm">{message.authorName}</strong>
                  <span className="text-[11px] text-muted-foreground">@{message.authorHandle}</span>
                  <time className="text-[11px] text-muted-foreground">{new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).format(new Date(message.createdAt))}</time></div>
                {message.deletedAt?<p className="mt-1 text-sm italic text-muted-foreground">{pt?'Mensagem cancelada':'Message removed'}</p>:
                  editingId===message.id?<form className="mt-2 space-y-2" onSubmit={event=>void updateMessage(event)}>
                    <textarea value={editingBody} onChange={event=>setEditingBody(event.target.value)} maxLength={4000} rows={2}
                      className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={pt?'Editar mensagem':'Edit message'}/>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" loading={busyAction==='editMessage'} disabled={busy||!editingBody.trim()}>{pt?'Salvar':'Save'}</Button>
                      <Button type="button" size="sm" variant="outline" onClick={()=>{setEditingId(null);setEditingBody('');}}>
                        {pt?'Cancelar':'Cancel'}</Button>
                    </div>
                  </form>:isCommunityGifUrl(message.body)?
                    <img src={message.body} alt={pt?'GIF enviado':'Sent GIF'} loading="lazy" referrerPolicy="no-referrer"
                      className="mt-2 max-h-64 max-w-full rounded-xl object-contain"/>:
                    <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm leading-6">{message.body}</p>}
                {isPendingMessage(message)&&<div role="status" className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {message.pending==='sending'?<><Spinner className="size-3.5"/>{pt?'Enviando…':'Sending…'}</>:
                    <><span className="text-destructive">{pt?'Falha no envio':'Send failed'}</span>
                    <button type="button" className="text-primary underline" onClick={()=>retryPending(message)}>
                      {pt?'Reenviar':'Retry'}</button></>}
                </div>}
                {!message.deletedAt&&message.editedAt&&<span className="mt-1 block text-[11px] text-muted-foreground">{pt?'Editada':'Edited'}</span>}
                {!message.deletedAt&&!isPendingMessage(message)&&<CommunityMessageReactions
                  reactions={message.reactions??[]} canReact={message.canReact}
                  open={reactionPickerId===message.id} busy={reactionBusyId===message.id}
                  pt={pt} onOpen={()=>setReactionPickerId(old=>old===message.id?null:message.id)}
                  onToggle={(emoji,mine)=>void toggleReaction(message,emoji,mine)}/>}
                {!message.deletedAt&&(message.canEdit||message.canDelete)&&<div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                  {message.canEdit&&editingId!==message.id&&<button type="button" className="hover:text-foreground"
                    onClick={()=>{setEditingId(message.id);setEditingBody(message.body??'');setDeletingId(null);}}>
                    {pt?'Editar':'Edit'}</button>}
                  {message.canDelete&&<button type="button" className="inline-flex items-center gap-1 hover:text-destructive" disabled={busy}
                    onClick={()=>void removeMessage(message.id)}>{busyAction==='deleteMessage:'+message.id&&<Spinner className="size-3.5"/>}{deletingId===message.id?
                      (pt?'Confirmar cancelamento':'Confirm removal'):(pt?'Cancelar mensagem':'Remove message')}</button>}
                  {deletingId===message.id&&<button type="button" className="hover:text-foreground" onClick={()=>setDeletingId(null)}>
                    {pt?'Voltar':'Back'}</button>}
                </div>}
              </div>
            </div>)}</div>
          </div>
          <form onSubmit={event=>void send(event)} className="relative shrink-0 border-t border-border/70 bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {mediaPicker&&<CommunityMediaPicker key={mediaPicker} tab={mediaPicker} pt={pt}
              onClose={()=>setMediaPicker(null)}
              onEmoji={symbol=>{setDraft(old=>old+symbol);setMediaPicker(null);}}
              onGif={url=>{queueText(url);setMediaPicker(null);}}/>}
            <div className="flex items-end gap-2 rounded-xl bg-secondary/60 p-2">
              <Button type="button" size="icon" variant="ghost" className="shrink-0" aria-label={pt?'Emojis':'Emojis'}
                aria-expanded={mediaPicker==='emoji'} onClick={()=>setMediaPicker(old=>old==='emoji'?null:'emoji')}>
                <Smile className="size-5"/></Button>
              <button type="button" aria-label={pt?'Enviar GIF':'Send GIF'} aria-expanded={mediaPicker==='gif'}
                onClick={()=>setMediaPicker(old=>old==='gif'?null:'gif')}
                className="mb-1 shrink-0 rounded-md border border-border px-1.5 py-1.5 text-[11px] font-bold hover:bg-secondary">GIF</button>
              <textarea aria-label={pt?'Mensagem do canal':'Channel message'} value={draft}
                onChange={event=>setDraft(event.target.value)} onKeyDown={onComposerKeyDown} maxLength={4000} rows={1}
                placeholder={(pt?'Mensagem em #':'Message in #')+activeChannel.name}
                className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"/>
              <Button type="submit" size="icon" disabled={!draft.trim()} aria-label={pt?'Enviar mensagem':'Send message'}>
                <Send className="size-4"/></Button>
            </div>
          </form>
        </>}
      </>:<div className="flex h-full items-center justify-center p-6 text-center">
        <div className="max-w-xs"><Users className="mx-auto size-11 text-primary"/>
          <h3 className="mt-4 font-semibold">{pt?'Suas comunidades':'Your communities'}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{pt?
            'Escolha uma comunidade e um canal para começar. Você também pode explorar ou criar uma nova comunidade.':
            'Choose a community and a channel. You can also discover or create a new community.'}</p>
          <Button className="mt-4 md:hidden" variant="outline" onClick={closeChannel}>{pt?'Voltar':'Back'}</Button>
        </div>
      </div>}
    </section>
    {(error||notice)&&<div role={error?'alert':'status'}
      className={cn('pointer-events-auto absolute bottom-20 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border border-border bg-popover px-4 py-3 text-center text-xs shadow-xl',error?'text-destructive':'text-primary')}>
      {error||notice}<button type="button" className="ml-3 underline" onClick={()=>{setError('');setNotice('');}}>{pt?'Fechar':'Close'}</button>
    </div>}
  </div>;
}
