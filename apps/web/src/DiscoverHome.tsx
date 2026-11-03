import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowRight,Compass,Hash,Headphones,MessageCircle,RefreshCw,Search,Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Skeleton} from '@/components/ui/skeleton';
import {useUorquiPreferences} from './UorquiPreferences';
import type {UnreadLocation} from './useCommunityUnread';

type Community={
  id:string;name:string;slug:string;description:string|null;avatarUrl:string|null;
  visibility:'public'|'approval'|'private';memberCount:number;myRole:string|null;
  requestKind:string|null;requestStatus:string|null;
};
type Recent={
  communityId:string;communityName:string;channelId:string;channelName:string;
  channelKind:'text'|'voice'|'meeting';createdAt:string;preview:string;
  activityKind:'message'|'reaction';actorName:string|null;attachmentType:string|null;
  reactionEmoji:string|null;messageAuthorName:string|null;
};
type Voice={
  communityId:string;communityName:string;channelId:string;channelName:string;participantCount:number;
};
type Activity={recent:Recent[];rooms:Voice[]};
const empty:Activity={recent:[],rooms:[]};

async function readJson<T>(url:string,signal:AbortSignal):Promise<T>{
  const result=await fetch(url,{credentials:'same-origin',cache:'no-store',signal});
  if(!result.ok)throw Error('HTTP_'+result.status);
  return result.json() as Promise<T>;
}

export default function DiscoverHome({active,unreadLocations,onOpenCommunity}:{
  active:boolean;unreadLocations:UnreadLocation[];
  onOpenCommunity:(communityId:string,channelId?:string)=>void;
}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [communities,setCommunities]=useState<Community[]>([]);
  const [activity,setActivity]=useState<Activity>(empty);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [version,setVersion]=useState(0);
  const requestId=useRef(0);
  const loaded=useRef(false);
  const refresh=useCallback(()=>setVersion(v=>v+1),[]);
  useEffect(()=>{
    if(!active)return;
    const controller=new AbortController();
    const id=++requestId.current;
    if(loaded.current)setRefreshing(true);
    else setLoading(true);
    void Promise.all([
      readJson<{communities:Community[]}>('/api/v1/communities',controller.signal),
      readJson<Activity>('/api/v1/communities/discover/activity',controller.signal)
    ]).then(([groups,events])=>{
      if(controller.signal.aborted||id!==requestId.current)return;
      setCommunities(groups.communities??[]);
      setActivity({recent:events.recent??[],rooms:events.rooms??[]});
      setError('');loaded.current=true;
    }).catch(()=>{
      if(!controller.signal.aborted&&id===requestId.current)
        setError(pt?'Não foi possível atualizar a descoberta.':'Could not update discovery.');
    }).finally(()=>{
      if(!controller.signal.aborted&&id===requestId.current){setLoading(false);setRefreshing(false);}
    });
    return()=>{controller.abort();};
  },[active,version,pt]);
  useEffect(()=>{
    if(!active)return;
    let timer:number|undefined;
    const schedule=()=>{
      if(document.visibilityState!=='visible')return;
      if(timer)window.clearTimeout(timer);
      timer=window.setTimeout(refresh,500);
    };
    const onVisibility=()=>{if(document.visibilityState==='visible')schedule();};
    window.addEventListener('uorqui:community-event',schedule);
    window.addEventListener('uorqui:community-channel-read',schedule);
    window.addEventListener('focus',schedule);
    document.addEventListener('visibilitychange',onVisibility);
    const fallback=window.setInterval(()=>{
      if(document.visibilityState==='visible')refresh();
    },30000);
    return()=>{
      window.clearInterval(fallback);
      if(timer)window.clearTimeout(timer);
      window.removeEventListener('uorqui:community-event',schedule);
      window.removeEventListener('uorqui:community-channel-read',schedule);
      window.removeEventListener('focus',schedule);
      document.removeEventListener('visibilitychange',onVisibility);
    };
  },[active,refresh]);

  const joined=communities.filter(item=>Boolean(item.myRole));
  const publicGroups=communities.filter(item=>item.visibility!=='private');
  const normalized=query.trim().toLocaleLowerCase(locale);
  const matches=publicGroups.filter(item=>(item.name+' '+item.slug+' '+(item.description??'')).toLocaleLowerCase(locale).includes(normalized));
  const recommended=[...publicGroups.filter(item=>!item.myRole)].sort((a,b)=>b.memberCount-a.memberCount||a.name.localeCompare(b.name)).slice(0,6);
  const displayed=normalized?matches:recommended.length?recommended:publicGroups.slice(0,6);
  const unreadByChannel=new Map(unreadLocations.map(location=>[location.channelId,location.count]));
  const activeVoiceChannels=new Set(activity.rooms.map(room=>room.channelId));
  const timestamp=(value:string)=>{
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'':date.toLocaleString(locale,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  };
  const summarize=(item:Recent)=>{
    const who=item.actorName||(pt?'Alguém':'Someone');
    if(item.activityKind==='reaction'){
      const target=item.messageAuthorName
        ?(pt?' à mensagem de '+item.messageAuthorName:' to '+item.messageAuthorName+"'s message")
        :(pt?' a uma mensagem':' to a message');
      return who+(pt?' reagiu ':' reacted ')+(item.reactionEmoji??'👍')+target;
    }
    const text=(item.preview??'').trim();
    const mime=item.attachmentType??'';
    if(mime==='image/gif'||/^https:\/\/media\.giphy\.com\/media\/[A-Za-z0-9]+\/giphy\.gif$/i.test(text))
      return who+(pt?' enviou um GIF':' sent a GIF');
    if(mime.startsWith('image/'))return who+(pt?' enviou uma foto':' sent a photo');
    if(mime.startsWith('video/'))return who+(pt?' enviou um vídeo':' sent a video');
    if(mime.startsWith('audio/'))return who+(pt?' enviou um áudio':' sent an audio message');
    if(mime)return who+(pt?' enviou um arquivo':' sent a file');
    if(/\b(?:https?:\/\/|www\.)/i.test(text))return who+(pt?' enviou um link':' sent a link');
    if(text&&/^[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D\u20E3\s]+$/u.test(text))
      return who+(pt?' enviou um emoji: ':' sent an emoji: ')+text;
    if(text)return who+': '+text;
    return who+(pt?' enviou uma mensagem':' sent a message');
  };
  const avatar=(item:Community)=><div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/15 font-bold text-primary">
    {item.avatarUrl?<img src={item.avatarUrl} alt="" className="size-full object-cover"/>:item.name.charAt(0).toUpperCase()}
  </div>;

  return <div className="h-full min-h-0 min-w-0 w-full max-w-full overflow-x-hidden overflow-y-auto overscroll-contain">
    <main className="mx-auto box-border w-full min-w-0 max-w-5xl space-y-7 px-4 py-6 pb-12 sm:px-7 sm:py-8">
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl"><Compass className="size-7 text-primary"/>{pt?'Descobrir':'Discover'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{pt?'Encontre comunidades e participe do que está acontecendo.':'Find communities and join the conversation.'}</p>
        </div>
        <Button variant="outline" size="icon" type="button" title={pt?'Atualizar':'Refresh'}
          aria-label={pt?'Atualizar descoberta':'Refresh discovery'} onClick={refresh} disabled={loading||refreshing}>
          <RefreshCw className={'size-4'+(refreshing?' animate-spin':'')}/>
        </Button>
      </header>
      {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <span>{error}</span><Button type="button" variant="outline" size="sm" onClick={refresh}>{pt?'Tentar novamente':'Retry'}</Button>
      </div>}
      <section aria-label={pt?'Buscar comunidades':'Search communities'} className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-5 text-muted-foreground"/>
        <Input value={query} onChange={e=>setQuery(e.target.value)} className="h-11 min-w-0 w-full pl-10 text-base"
          placeholder={pt?'Buscar comunidades por nome ou interesse':'Search communities by name or interest'} />
      </section>
      {!normalized&&<section aria-labelledby="discover-activity-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="discover-activity-heading" className="text-lg font-semibold">{pt?'Acontecendo agora':'Happening now'}</h2>
          <span className="text-xs text-muted-foreground">{pt?'Nas suas comunidades':'In your communities'}</span>
        </div>
        {loading?<div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{[0,1,2,3].map(i=><Skeleton key={i} className="h-24 rounded-xl"/>)}</div>:
        !joined.length?<div className="rounded-xl border border-dashed border-border bg-card/50 p-5">
          <p className="font-medium">{pt?'Sua próxima conversa começa em uma comunidade.':'Your next conversation starts in a community.'}</p>
          <p className="mt-1 text-sm text-muted-foreground">{pt?'Explore as sugestões abaixo para encontrar seu espaço.':'Explore the suggestions below to find your place.'}</p>
        </div>:!activity.recent.length&&!activity.rooms.length?<div className="rounded-xl border border-border bg-card/50 p-5">
          <p className="font-medium">{pt?'Nenhuma atividade recente por enquanto.':'No recent activity yet.'}</p>
          <p className="mt-1 text-sm text-muted-foreground">{pt?'Você já participa de comunidades. Entre em um canal para começar.':'You have joined communities. Open a channel to get started.'}</p>
          <Button size="sm" variant="secondary" className="mt-3 gap-2" onClick={()=>onOpenCommunity(joined[0].id)}>{pt?'Abrir comunidade':'Open community'}<ArrowRight className="size-4"/></Button>
        </div>:<div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {activity.rooms.map(room=><button type="button" key={'voice:'+room.channelId}
            onClick={()=>onOpenCommunity(room.communityId,room.channelId)}
            className="flex min-h-24 min-w-0 w-full max-w-full items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Headphones className="size-5"/></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{room.channelName}</span>
              <span className="block truncate text-xs text-muted-foreground">{room.communityName}</span>
              <span className="mt-1 block text-xs text-primary">{room.participantCount} {pt?(room.participantCount===1?'pessoa na sala':'pessoas na sala'):(room.participantCount===1?'person in voice':'people in voice')}</span>
            </span><ArrowRight className="size-4 shrink-0 text-muted-foreground"/>
          </button>)}
          {activity.recent.filter(item=>!activeVoiceChannels.has(item.channelId)).slice(0,Math.max(3,8-activity.rooms.length)).map(item=><button type="button" key={'recent:'+item.channelId}
            onClick={()=>onOpenCommunity(item.communityId,item.channelId)}
            className="flex min-h-24 min-w-0 w-full max-w-full items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">{item.channelKind==='voice'||item.channelKind==='meeting'?<Headphones className="size-5"/>:<Hash className="size-5"/>}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2"><strong className="truncate text-sm">{item.channelName}</strong>
                {!!unreadByChannel.get(item.channelId)&&<span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">{unreadByChannel.get(item.channelId)}</span>}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{item.communityName}</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">{summarize(item)} · {timestamp(item.createdAt)}</span>
            </span><ArrowRight className="size-4 shrink-0 text-muted-foreground"/>
          </button>)}
        </div>}
      </section>}
      <section aria-labelledby="discover-groups-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="discover-groups-heading" className="text-lg font-semibold">{normalized?(pt?'Resultados da busca':'Search results'):(pt?'Comunidades recomendadas':'Recommended communities')}</h2>
          {!normalized&&<span className="text-xs text-muted-foreground">{pt?'Espaços públicos':'Public spaces'}</span>}
        </div>
        {loading?<div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{[0,1,2,3].map(i=><Skeleton key={i} className="h-32 rounded-xl"/>)}</div>:
        !displayed.length?<div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
          {normalized?(pt?'Nenhuma comunidade corresponde à sua busca.':'No communities match your search.'):(pt?'Ainda não há comunidades públicas disponíveis. Você pode criar uma em Comunidades.':'No public communities are available yet. You can create one under Communities.')}
        </div>:<div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {displayed.map(item=><button type="button" key={item.id} onClick={()=>onOpenCommunity(item.id)}
            className="flex min-h-32 min-w-0 w-full max-w-full items-start gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            {avatar(item)}
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{item.name}</strong>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><Users className="size-3.5"/>{item.memberCount} {pt?'membros':'members'} · {item.myRole?(pt?'Você participa':'Joined'):item.visibility==='approval'?(pt?'Entrada por aprovação':'Approval required'):(pt?'Entrada livre':'Open to join')}</span>
              {item.description&&<span className="mt-2 block line-clamp-2 break-words text-xs text-muted-foreground">{item.description}</span>}
              <span className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">{item.myRole?(pt?'Abrir comunidade':'Open community'):(pt?'Conhecer comunidade':'Explore community')}<ArrowRight className="size-3.5"/></span>
            </span>
          </button>)}
        </div>}
      </section>
      {!normalized&&joined.length>0&&<section aria-label={pt?'Minhas comunidades':'My communities'} className="space-y-3">
        <h2 className="text-lg font-semibold">{pt?'Minhas comunidades':'My communities'}</h2>
        <div className="flex flex-wrap gap-2">
          {joined.map(item=><Button type="button" key={item.id} variant="outline" className="max-w-full gap-2" onClick={()=>onOpenCommunity(item.id)}>
            <MessageCircle className="size-4"/><span className="truncate">{item.name}</span>
          </Button>)}
        </div>
      </section>}
    </main>
  </div>;
}
