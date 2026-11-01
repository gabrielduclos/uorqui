import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type TouchEvent, type WheelEvent } from 'react';
import { ArrowDown, ArrowLeft, ChevronLeft, ChevronRight, Heart, ImagePlus, MessageCircle, Play, Send, Share2, Trash2, Video, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from './UserProfiles';
import { useUorquiPreferences } from './UorquiPreferences';
import { ZoomableChatImage } from './ZoomableChatImage';
import { ensureChatMediaCached, invalidateChatMedia, setFeedVideoCacheWindow, useCachedChatMedia, useCachedFeedVideo } from './chatMediaCache';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { clearFeedSessionCache,readFeedSession,readFeedSessionFilter,writeFeedSession } from './feedSessionCache';

type Media={id:string;type:string;size:number;position:number};
type Post={
  id:string;body:string;mediaCount:number;createdAt:string;publishedAt:string;
  authorHandle:string;authorName:string;authorAvatar:string|null;
  mine:boolean;following:boolean;likeCount:number;liked:boolean;commentCount:number;media:Media[];
};
type Comment={id:string;body:string;createdAt:string;authorHandle:string|null;authorName:string|null;authorAvatar:string|null;mine:boolean;canDelete:boolean;deleted:boolean};
type FeedFilter='for-you'|'following';
type FeedSnapshot={posts:Post[];cursor:string|null;hasMore:boolean;scrollTop:number;fetchedAt:number};
const REVALIDATE_AFTER_MS=30_000;
const mimeTypes=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','video/mp4','video/webm','video/quicktime']);
const LIMIT=50*1024*1024;
async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const res=await fetch(path,{...options,credentials:'same-origin',cache:'no-store'});
  if(!res.ok){const info=await res.json().catch(()=>null) as {error?:string}|null;throw Error(info?.error??'HTTP_'+res.status);}
  if(res.status===204)return undefined as T;
  return res.json() as Promise<T>;
}
const requestBody=(data:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const mediaUrl=(id:string)=>'/media/feed/'+id;
function FeedVideo({post,open,paused}:{post:Post;open:()=>void;paused:boolean}){
  const ref=useRef<HTMLVideoElement>(null);
  const video=post.media.find(m=>m.type.startsWith('video/'));
  const [nearby,setNearby]=useState(false);
  const {src,loading:videoLoading}=useCachedFeedVideo(video?mediaUrl(video.id):null,nearby);
  useEffect(()=>{
    const element=ref.current;
    if(!element)return;
    const proximity=new IntersectionObserver(entries=>setNearby(!!entries[0]?.isIntersecting),
      {rootMargin:'600px',threshold:0});
    proximity.observe(element);
    return ()=>proximity.disconnect();
  },[]);
  useEffect(()=>{
    const video=ref.current;if(!video)return;
    if(paused){video.pause();return;}
    const onOther=(event:Event)=>{if((event as CustomEvent<string>).detail!==post.id)video.pause();};
    window.addEventListener('uorqui:feed-active-video',onOther);
    const observer=new IntersectionObserver(entries=>{
      if(entries[0]?.intersectionRatio>=0.7){
        window.dispatchEvent(new CustomEvent('uorqui:feed-active-video',{detail:post.id}));
        void video.play().catch(()=>{});
      }else video.pause();
    },{threshold:[0,0.7,1]});
    observer.observe(video);
    return ()=>{observer.disconnect();window.removeEventListener('uorqui:feed-active-video',onOther);video.pause();};
  },[paused,post.id,src]);
  if(!video)return null;
  return <button type="button" className="group relative mt-3 block w-full overflow-hidden rounded-xl bg-black" onClick={open}
    aria-label="Abrir vídeo">
    <video ref={ref} src={src??undefined} muted loop playsInline preload="metadata"
      className="mx-auto max-h-[min(74dvh,600px)] w-full object-contain" />
    {videoLoading&&nearby&&<span className="pointer-events-none absolute inset-0 grid place-items-center text-white"
      role="status" aria-label="Carregando vídeo"><Spinner className="size-6"/></span>}
    <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/65 px-3 py-1.5 text-xs text-white">
      <Play className="size-3.5"/>Vídeo</span>
  </button>;
}
/** Full-bleed, in-app player: never expose the browser's external video controls. */
function ExpandedFeedVideo({mediaId,pt}:{mediaId:string;pt:boolean}){
  const video=useRef<HTMLVideoElement>(null);
  const startY=useRef<number|null>(null);
  const moved=useRef(false);
  const isPresent=useIsPresent();
  const [muted,setMuted]=useState(true);
  const [playing,setPlaying]=useState(true);
  const [landscape,setLandscape]=useState(false);
  const [progress,setProgress]=useState(0);
  const {src,loading}=useCachedFeedVideo(mediaUrl(mediaId));
  useEffect(()=>{
    if(!isPresent){video.current?.pause();return;}
    if(!src)return;
    const sync=()=>{
      if(document.visibilityState==='hidden'){video.current?.pause();return;}
      void video.current?.play().catch(()=>setPlaying(false));
    };
    sync();
    document.addEventListener('visibilitychange',sync);
    return ()=>document.removeEventListener('visibilitychange',sync);
  },[isPresent,src]);
  function toggle(){
    if(moved.current){moved.current=false;return;}
    const current=video.current;
    if(!current)return;
    if(current.paused)void current.play().catch(()=>setPlaying(false));
    else current.pause();
  }
  return <div className="absolute inset-0 overflow-hidden bg-black">
    {src?<video ref={video} src={src} autoPlay loop muted={muted} playsInline
      disablePictureInPicture disableRemotePlayback
      controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
      preload="auto" onContextMenu={event=>event.preventDefault()}
      onLoadedMetadata={event=>{
        const element=event.currentTarget;
        setLandscape(element.videoWidth>element.videoHeight);
      }}
      onTimeUpdate={event=>{
        const element=event.currentTarget;
        setProgress(element.duration>0?element.currentTime/element.duration:0);
      }}
      onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
      className={landscape?'absolute inset-0 h-full w-full object-contain':
        'absolute inset-0 h-full w-full object-cover md:object-contain'}/>:
      <div role="status" aria-label={pt?'Carregando vídeo':'Loading video'}
        className="absolute inset-0 flex items-center justify-center text-white/75">{loading&&<Spinner className="size-7"/>}</div>}
    <button type="button" disabled={!src}
      aria-label={playing?(pt?'Pausar vídeo':'Pause video'):(pt?'Reproduzir vídeo':'Play video')}
      onTouchStart={event=>{startY.current=event.touches[0]?.clientY??null;moved.current=false;}}
      onTouchMove={event=>{
        if(startY.current!==null && Math.abs((event.touches[0]?.clientY??startY.current)-startY.current)>16)moved.current=true;
      }}
      onTouchEnd={()=>{startY.current=null;}}
      onClick={toggle}
      className="absolute inset-0 z-[1] flex items-center justify-center text-white"
      >
      {!playing&&src&&<span className="rounded-full bg-black/50 p-5"><Play className="size-9" fill="currentColor"/></span>}
    </button>
    {src&&<button type="button" onClick={()=>setMuted(value=>!value)}
      className="absolute bottom-16 left-3 z-[2] grid size-10 place-items-center rounded-full bg-black/55 text-white"
      aria-label={muted?(pt?'Ativar som':'Unmute'):(pt?'Silenciar':'Mute')}>
      {muted?<VolumeX className="size-5"/>:<Volume2 className="size-5"/>}
    </button>}
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-1 bg-white/25">
      <div className="h-full bg-white transition-[width] duration-150" style={{width:(progress*100)+'%'}}/>
    </div>
  </div>;
}
function PostGallery({post,onZoom}:{post:Post;onZoom:(src:string)=>void}){
  const items=post.media.filter(item=>item.type.startsWith('image/'));
  const [index,setIndex]=useState(0);
  const touchStart=useRef<number|null>(null);
  const swiped=useRef(false);
  if(!items.length)return null;
  const current=items[Math.min(index,items.length-1)];
  const cached=useCachedChatMedia(current?mediaUrl(current.id):null,!!current);
  return <div className="relative mt-3 overflow-hidden rounded-xl bg-muted/50"
    onTouchStart={event=>{touchStart.current=event.touches[0]?.clientX??null;swiped.current=false;}}
    onTouchEnd={event=>{
      if(touchStart.current===null||items.length<2)return;
      const diff=touchStart.current-(event.changedTouches[0]?.clientX??touchStart.current);
      touchStart.current=null;
      if(Math.abs(diff)>45){swiped.current=true;setIndex(old=>(old+(diff>0?1:-1)+items.length)%items.length);}
    }}>
    <button type="button" onClick={()=>{if(!swiped.current)onZoom(mediaUrl(current.id));swiped.current=false;}} className="block w-full" aria-label="Ampliar imagem">
      <img src={cached||mediaUrl(current.id)} alt={'Imagem '+(index+1)+' de '+items.length} loading="lazy"
        className="mx-auto max-h-[min(70dvh,620px)] w-full object-contain"/>
    </button>
    {items.length>1&&<>
      <button type="button" onClick={()=>setIndex(old=>(old-1+items.length)%items.length)} aria-label="Imagem anterior"
        className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white">
        <ChevronLeft className="size-5"/></button>
      <button type="button" onClick={()=>setIndex(old=>(old+1)%items.length)} aria-label="Próxima imagem"
        className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white">
        <ChevronRight className="size-5"/></button>
      <span className="absolute bottom-3 right-3 rounded-full bg-black/65 px-2 py-1 text-xs text-white">{index+1}/{items.length}</span>
    </>}
  </div>;
}

export default function LiveFeed({userId,ownName,ownAvatar,active,onCommentFocusChange}:{
  userId:string;ownName:string;ownAvatar:string|null;active:boolean;onCommentFocusChange?:(focused:boolean)=>void;
}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [filter,setFilter]=useState<FeedFilter>(()=>readFeedSessionFilter(userId));
  const [posts,setPosts]=useState<Post[]>(()=>readFeedSession<Post>(userId,readFeedSessionFilter(userId))?.posts??[]);
  const [cursor,setCursor]=useState<string|null>(()=>readFeedSession<Post>(userId,readFeedSessionFilter(userId))?.cursor??null);
  const [loading,setLoading]=useState(()=>!readFeedSession<Post>(userId,readFeedSessionFilter(userId)));
  const [feedReady,setFeedReady]=useState(true);
  const [loadingMore,setLoadingMore]=useState(false);
  const [hasMore,setHasMore]=useState(()=>readFeedSession<Post>(userId,readFeedSessionFilter(userId))?.hasMore??true);
  const [error,setError]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  const scrollRef=useRef<HTMLDivElement>(null);
  const bottomRef=useRef<HTMLDivElement>(null);
  const loadingRef=useRef(false);
  const snapshots=useRef<Partial<Record<FeedFilter,FeedSnapshot>>>({
    'for-you':readFeedSession<Post>(userId,'for-you')??undefined,
    following:readFeedSession<Post>(userId,'following')??undefined,
  });
  const fetchedAtRef=useRef<Partial<Record<FeedFilter,number>>>({});
  const activeRef=useRef(active);
  activeRef.current=active;
  // Persist per-filter snapshots only in the module's bounded tab-memory map.
  useEffect(()=>{
    const old=snapshots.current[filter];
    if(!old&&!posts.length)return;
    const snapshot:FeedSnapshot={posts,cursor,hasMore,
      scrollTop:scrollRef.current?.scrollTop??old?.scrollTop??0,
      fetchedAt:fetchedAtRef.current[filter]??old?.fetchedAt??Date.now()};
    snapshots.current[filter]=snapshot;
    writeFeedSession(userId,filter,snapshot);
  },[userId,filter,posts,cursor,hasMore]);
  useEffect(()=>{
    const container=scrollRef.current;
    if(!container)return;
    const initial=snapshots.current[filter]?.scrollTop??0;
    window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>container.scrollTop=initial));
    const onScroll=()=>{
      const old=snapshots.current[filter];
      if(old){old.scrollTop=container.scrollTop;writeFeedSession(userId,filter,old);}
    };
    container.addEventListener('scroll',onScroll,{passive:true});
    return ()=>{container.removeEventListener('scroll',onScroll);onScroll();};
  },[userId,filter]);
  const [draft,setDraft]=useState('');
  const [files,setFiles]=useState<File[]>([]);
  const [preview,setPreview]=useState<string[]>([]);
  const fileRef=useRef<HTMLInputElement>(null);
  const [draftId,setDraftId]=useState<string|null>(null);
  const [posting,setPosting]=useState(false);
  const [uploadProgress,setUploadProgress]=useState('');
  const [openComments,setOpenComments]=useState<string|null>(null);
  const [comments,setComments]=useState<Record<string,Comment[]>>({});
  const [commentDraft,setCommentDraft]=useState('');
  const [commentBusy,setCommentBusy]=useState(false);
  const [deleteCandidate,setDeleteCandidate]=useState<{postId:string;commentId:string}|null>(null);
  const [deleteBusy,setDeleteBusy]=useState(false);
  const commentInputRef=useRef<HTMLInputElement|null>(null);
  const [commentFocused,setCommentFocused]=useState(false);
  const [likeBusy,setLikeBusy]=useState<string|null>(null);
  const [followBusy,setFollowBusy]=useState<string|null>(null);
  const [deleting,setDeleting]=useState<string|null>(null);
  const [editingPost,setEditingPost]=useState<string|null>(null);
  const [editingBody,setEditingBody]=useState('');
  const [editBusy,setEditBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [zoom,setZoom]=useState<string|null>(null);
  const [videoOpen,setVideoOpen]=useState(false);
  const [videoCommentsOpen,setVideoCommentsOpen]=useState(false);
  const [videos,setVideos]=useState<Post[]>([]);
  const [videoIndex,setVideoIndex]=useState(0);
  const [videoDirection,setVideoDirection]=useState<1|-1>(1);
  const [videoCursor,setVideoCursor]=useState<string|null>(null);
  const [videoLoading,setVideoLoading]=useState(false);
  const gesture=useRef<number|null>(null);
  const wheelAt=useRef(0);
  const videosRef=useRef<Post[]>([]);
  const videoCursorRef=useRef<string|null>(null);
  const videoBusy=useRef(false);
  useEffect(()=>{videosRef.current=videos;videoCursorRef.current=videoCursor;},[videos,videoCursor]);

  useEffect(()=>{
    const purge=()=>{
      clearFeedSessionCache();
      snapshots.current={};
      fetchedAtRef.current={};
      setPosts([]);setVideos([]);setCursor(null);setHasMore(true);
      setLoading(true);setRefreshKey(k=>k+1);
    };
    window.addEventListener('uorqui:blocks-updated',purge);
    return ()=>window.removeEventListener('uorqui:blocks-updated',purge);
  },[]);

  useEffect(()=>{
    const urls=files.map(f=>URL.createObjectURL(f));
    setPreview(urls);
    return ()=>urls.forEach(url=>URL.revokeObjectURL(url));
  },[files]);

  // The timeline stays in memory per account and per filter; no private post body
  // is written to Service Worker, Cache Storage, IndexedDB or localStorage.
  useEffect(()=>{
    if(!active)return;
    const snapshot=snapshots.current[filter];
    if(snapshot && !refreshKey && Date.now()-snapshot.fetchedAt<REVALIDATE_AFTER_MS)return;
    const controller=new AbortController();
    const prior=snapshots.current[filter];
    if(!prior){setLoading(true);setError('');}
    loadingRef.current=false;
    void api<{posts:Post[];nextCursor:string|null}>('/api/v1/feed/posts?filter='+filter,{signal:controller.signal})
      .then(result=>{
        if(controller.signal.aborted)return;
        const old=snapshots.current[filter];
        const retainsOlder=!!old && old.posts.length>12 && !refreshKey;
        const freshIds=new Set(result.posts.map(post=>post.id));
        const merged=retainsOlder
          ?[...result.posts,...old.posts.filter(post=>!freshIds.has(post.id))].slice(0,100)
          :result.posts;
        const nextCursor=retainsOlder?old.cursor:result.nextCursor;
        const more=retainsOlder?old.hasMore:!!result.nextCursor;
        const updated=Date.now();
        fetchedAtRef.current[filter]=updated;
        snapshots.current[filter]={posts:merged,cursor:nextCursor,hasMore:more,
          scrollTop:scrollRef.current?.scrollTop??old?.scrollTop??0,fetchedAt:updated};
        writeFeedSession(userId,filter,snapshots.current[filter]);
        setFeedReady(true);setPosts(merged);setCursor(nextCursor);setHasMore(more);
        setError('');setLoading(false);
      }).catch(e=>{
        if(controller.signal.aborted)return;
        setFeedReady(!(e instanceof Error&&e.message==='FEED_NOT_READY'));
        // A failed revalidation does not erase the visible cached feed.
        setError(e instanceof Error&&e.message==='FEED_NOT_READY'?
          (pt?'O feed está aguardando a ativação do banco de dados.':'Feed database activation is pending.'):
          (pt?'Não foi possível atualizar as publicações.':'Could not refresh posts.'));
        setLoading(false);
      });
    return ()=>controller.abort();
  },[active,filter,refreshKey,pt]);

  function changeFilter(next:FeedFilter){
    if(next===filter)return;
    const updated=fetchedAtRef.current[filter]??Date.now();
    snapshots.current[filter]={posts,cursor,hasMore,
      scrollTop:scrollRef.current?.scrollTop??0,fetchedAt:updated};
    writeFeedSession(userId,filter,snapshots.current[filter]);
    const cached=snapshots.current[next]??readFeedSession<Post>(userId,next)??undefined;
    setPosts(cached?.posts??[]);setCursor(cached?.cursor??null);
    setHasMore(cached?.hasMore??true);
    setLoading(!cached);setError('');setFilter(next);
    window.requestAnimationFrame(()=>scrollRef.current?.scrollTo({top:cached?.scrollTop??0,behavior:'instant'}));
  }
  useEffect(()=>{
    if(!active){setVideoOpen(false);setVideoCommentsOpen(false);}
  },[active]);
  useEffect(()=>{
    if(!active)return;
    const onVisible=()=>{
      if(document.visibilityState==='visible' &&
        Date.now()-(fetchedAtRef.current[filter]??0)>REVALIDATE_AFTER_MS)
        setRefreshKey(n=>n+1);
    };
    document.addEventListener('visibilitychange',onVisible);
    return ()=>document.removeEventListener('visibilitychange',onVisible);
  },[active,filter]);

  const loadMore=useCallback(async()=>{
    if(!activeRef.current||loadingRef.current||!cursor||loading||!hasMore)return;
    loadingRef.current=true;setLoadingMore(true);
    try{
      const result=await api<{posts:Post[];nextCursor:string|null}>('/api/v1/feed/posts?filter='+filter+'&cursor='+encodeURIComponent(cursor));
      const old=snapshots.current[filter];
      const existing=old?.posts??posts;
      const combined=[...existing,...result.posts.filter(p=>!existing.some(item=>item.id===p.id))].slice(0,100);
      setPosts(combined);
      setCursor(result.nextCursor);setHasMore(!!result.nextCursor);
      snapshots.current[filter]={posts:combined,cursor:result.nextCursor,hasMore:!!result.nextCursor,
        scrollTop:scrollRef.current?.scrollTop??0,fetchedAt:fetchedAtRef.current[filter]??Date.now()};
      writeFeedSession(userId,filter,snapshots.current[filter]);
    }catch{setError(pt?'Falha ao carregar mais publicações.':'Could not load more posts.');}
    finally{loadingRef.current=false;setLoadingMore(false);}
  },[cursor,filter,loading,hasMore,pt,posts]);

  useEffect(()=>{
    const root=scrollRef.current,target=bottomRef.current;
    if(!root||!target||!active||!hasMore||loading)return;
    const observer=new IntersectionObserver(entries=>{if(entries[0]?.isIntersecting)void loadMore();},
      {root,rootMargin:'600px',threshold:0});
    observer.observe(target);return ()=>observer.disconnect();
  },[active,hasMore,loading,loadMore]);

  useEffect(()=>{
    const wanted=new URLSearchParams(window.location.search).get('post');
    if(!wanted||!/^[0-9a-f-]{36}$/.test(wanted))return;
    let active=true;
    void api<{post:Post}>('/api/v1/feed/posts/'+wanted).then(result=>{
      if(active)setPosts(old=>old.some(p=>p.id===wanted)?old:[result.post,...old]);
    }).catch(()=>{});
    return ()=>{active=false;};
  },[]);

  function resetComposer(){setDraft('');setFiles([]);setDraftId(null);setUploadProgress('');}
  async function discardPendingDraft(){
    if(posting)return;
    const id=draftId;
    if(!id){resetComposer();return;}
    setPosting(true);
    try{
      await api('/api/v1/feed/posts/'+id,{method:'DELETE'});
      resetComposer();setError('');
    }catch{setError(pt?'Falha ao descartar o envio. Tente novamente.':'Could not discard upload. Retry.');}
    finally{setPosting(false);}
  }
  function selectFiles(event:ChangeEvent<HTMLInputElement>){
    const chosen=Array.from(event.target.files??[]);event.target.value='';
    if(!chosen.length)return;
    if(draftId){
      setError(pt?'Descarte o envio pendente antes de trocar as mídias.':'Discard the pending upload before changing media.');
      return;
    }
    const combined=[...files,...chosen],videos=combined.filter(f=>f.type.startsWith('video/'));
    if(combined.some(f=>!mimeTypes.has(f.type)||!f.size||f.size>LIMIT)||
      combined.length>6||(videos.length>0&&combined.length!==1)){
      setError(pt?'Envie até 6 imagens ou 1 vídeo, com até 50 MB por arquivo.':
        'Use up to 6 images or 1 video, with a 50 MB limit per file.');return;
    }
    setError('');setFiles(combined);
  }
  async function publish(event:FormEvent){
    event.preventDefault();
    if(posting||!feedReady||(!draft.trim()&&!files.length))return;
    setPosting(true);setError('');
    try{
      let id=draftId;
      if(!id){
        const result=await api<{post:{id:string;publishedAt:string|null}}>('/api/v1/feed/posts',requestBody({body:draft.trim(),mediaCount:files.length}));
        id=result.post.id;if(files.length)setDraftId(id);
      }
      if(draftId){
        await api('/api/v1/feed/posts/'+id,{
          method:'PATCH',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({body:draft.trim()})
        });
      }
      if(files.length){
        const existing=await api<{draft:{media:{position:number}[]}}>('/api/v1/feed/posts/'+id+'/draft');
        const uploaded=new Set(existing.draft.media.map(m=>m.position));
        for(let i=0;i<files.length;i++){
          if(uploaded.has(i))continue;
          setUploadProgress((pt?'Enviando mídia ':'Uploading media ')+(i+1)+'/'+files.length);
          const result=await fetch('/api/media/feed/'+id+'/'+i,{
            method:'POST',credentials:'same-origin',cache:'no-store',
            headers:{'Content-Type':files[i].type},body:files[i]
          });
          if(!result.ok)throw Error('UPLOAD_'+result.status);
        }
        setUploadProgress(pt?'Publicando…':'Publishing…');
        await api('/api/v1/feed/posts/'+id+'/publish',requestBody({}));
      }
      resetComposer();setRefreshKey(old=>old+1);scrollRef.current?.scrollTo({top:0,behavior:'smooth'});
    }catch(e){
      setError(pt?'Não foi possível publicar. Confira a conexão e tente novamente.':
        'Could not publish. Check your connection and retry.');
    }finally{setPosting(false);setUploadProgress('');}
  }

  function updatePost(id:string,update:(p:Post)=>Post){
    setPosts(old=>old.map(p=>p.id===id?update(p):p));
    setVideos(old=>old.map(p=>p.id===id?update(p):p));
  }
  function setAuthorFollow(handle:string,following:boolean){
    setPosts(old=>old.map(p=>p.authorHandle===handle?{...p,following}:p));
    setVideos(old=>old.map(p=>p.authorHandle===handle?{...p,following}:p));
  }
  async function toggleFollow(post:Post){
    if(followBusy||post.mine)return;
    setFollowBusy(post.authorHandle);setError('');
    setAuthorFollow(post.authorHandle,!post.following);
    try{
      await api('/api/v1/feed/follows/'+encodeURIComponent(post.authorHandle),
        {method:post.following?'DELETE':'PUT'});
    }catch(error){
      setAuthorFollow(post.authorHandle,post.following);
      setError(error instanceof Error&&error.message==='PRIVATE_PROFILE'
        ?(pt?'Este perfil aceita apenas amigos.':'This profile is available only to friends.')
        :(pt?'Não foi possível atualizar quem você segue.':'Could not update following.'));
    }finally{setFollowBusy(null);}
  }
  async function toggleLike(post:Post){
    if(likeBusy)return;
    setLikeBusy(post.id);
    updatePost(post.id,p=>({...p,liked:!post.liked,likeCount:Math.max(0,p.likeCount+(post.liked?-1:1))}));
    try{await api('/api/v1/feed/posts/'+post.id+'/like',{method:post.liked?'DELETE':'PUT'});}
    catch{updatePost(post.id,p=>({...p,liked:post.liked,likeCount:Math.max(0,p.likeCount+(post.liked?1:-1))}));}
    finally{setLikeBusy(null);}
  }
  async function showComments(post:Post){
    if(openComments===post.id){setOpenComments(null);return;}
    setOpenComments(post.id);setCommentDraft('');
    try{
      const result=await api<{comments:Comment[]}>('/api/v1/feed/posts/'+post.id+'/comments');
      setComments(old=>({...old,[post.id]:result.comments}));
    }catch{setError(pt?'Não foi possível carregar comentários.':'Comments unavailable.');}
  }
  async function sendComment(event:FormEvent,post:Post){
    event.preventDefault();if(commentBusy||!commentDraft.trim())return;
    setCommentBusy(true);
    try{
      await api('/api/v1/feed/posts/'+post.id+'/comments',requestBody({body:commentDraft.trim()}));
      setCommentDraft('');
      const result=await api<{comments:Comment[]}>('/api/v1/feed/posts/'+post.id+'/comments');
      setComments(old=>({...old,[post.id]:result.comments}));
      updatePost(post.id,p=>({...p,commentCount:p.commentCount+1}));
    }catch{setError(pt?'Comentário não enviado.':'Comment failed.');}
    finally{setCommentBusy(false);}
  }
  async function removeComment(post:Post,commentId:string){
    if(deleteBusy)return;
    const deletingOwnComment=comments[post.id]?.some(c=>c.id===commentId&&c.mine)??false;
    setDeleteBusy(true);
    try{
      await api('/api/v1/feed/posts/'+post.id+'/comments/'+commentId,{method:'DELETE'});
      setComments(old=>({...old,[post.id]:(old[post.id]??[]).flatMap(c=>c.id!==commentId?[c]:
        deletingOwnComment?[]:[{...c,deleted:true,body:'',authorName:null,authorHandle:null,authorAvatar:null,canDelete:false}])}));
      updatePost(post.id,p=>({...p,commentCount:Math.max(0,p.commentCount-1)}));
      setDeleteCandidate(null);
    }catch{setError(pt?'Não foi possível remover o comentário.':'Could not remove comment.');}
    finally{setDeleteBusy(false);}
  }
  function commentFocus(input:HTMLInputElement){
    commentInputRef.current=input;
    setCommentFocused(true);
    onCommentFocusChange?.(true);
    // iOS/Samsung resize the visual viewport only after the keyboard animation.
    // Scroll only the feed's own container, without moving the fixed app header.
    const move=()=>input.scrollIntoView({block:'nearest',behavior:'smooth'});
    window.requestAnimationFrame(move);
    window.setTimeout(move,180);
  }
  useEffect(()=>{
    if(!commentFocused)return;
    const viewport=window.visualViewport;
    const adjust=()=>commentInputRef.current?.scrollIntoView({block:'nearest'});
    viewport?.addEventListener('resize',adjust);
    viewport?.addEventListener('scroll',adjust);
    return ()=>{viewport?.removeEventListener('resize',adjust);viewport?.removeEventListener('scroll',adjust);};
  },[commentFocused]);
  useEffect(()=>{
    if(!active){
      setCommentFocused(false);onCommentFocusChange?.(false);
      commentInputRef.current=null;
    }
  },[active,onCommentFocusChange]);
  async function updatePostBody(event:FormEvent,post:Post){
    event.preventDefault();
    if(editBusy||(!editingBody.trim()&&!post.media.length))return;
    setEditBusy(true);setError('');
    try{
      const clean=editingBody.trim();
      await api('/api/v1/feed/posts/'+post.id,{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:clean})
      });
      updatePost(post.id,item=>({...item,body:clean}));
      setEditingPost(null);setEditingBody('');
    }catch{setError(pt?'Não foi possível editar a publicação.':'Could not edit post.');}
    finally{setEditBusy(false);}
  }
  async function removePost(post:Post){
    if(deleting!==post.id){setDeleting(post.id);return;}
    try{
      await api('/api/v1/feed/posts/'+post.id,{method:'DELETE'});
      for(const media of post.media)invalidateChatMedia(mediaUrl(media.id));
      setPosts(old=>old.filter(p=>p.id!==post.id));
      setVideos(old=>old.filter(p=>p.id!==post.id));setDeleting(null);
    }catch{setError(pt?'Não foi possível excluir a publicação.':'Could not remove post.');}
  }
  async function share(post:Post){
    const url=window.location.origin+'/?post='+post.id;
    try{
      if(navigator.share)await navigator.share({url});
      else{await navigator.clipboard.writeText(url);setNotice(pt?'Link copiado.':'Link copied.');}
    }catch{/* User may dismiss share sheet. */}
  }
  async function openVideoComments(post:Post){
    setVideoCommentsOpen(true);setCommentDraft('');
    try{
      const r=await api<{comments:Comment[]}>('/api/v1/feed/posts/'+post.id+'/comments');
      setComments(old=>({...old,[post.id]:r.comments}));
    }catch{setError(pt?'Comentários indisponíveis.':'Comments unavailable.');}
  }
  const fetchVideos=useCallback(async(first:boolean,selected?:Post)=>{
    if(videoBusy.current)return;
    videoBusy.current=true;setVideoLoading(true);
    try{
      const next=first?null:videoCursorRef.current;
      if(!first&&!next)return;
      const r=await api<{posts:Post[];nextCursor:string|null}>('/api/v1/feed/posts?filter=videos'+(next?'&cursor='+encodeURIComponent(next):''));
      setVideos(old=>{
        const initial=first?(selected?[selected]:[]):old;
        return [...initial,...r.posts.filter(p=>!initial.some(item=>item.id===p.id))];
      });
      setVideoCursor(r.nextCursor);videoCursorRef.current=r.nextCursor;
    }catch{setError(pt?'Vídeos indisponíveis no momento.':'Videos unavailable.');}
    finally{setVideoLoading(false);videoBusy.current=false;}
  },[pt]);
  function openVideo(post?:Post){
    setVideoDirection(1);setVideoCommentsOpen(false);setVideoOpen(true);setVideoIndex(0);setVideos(post?[post]:[]);
    videosRef.current=post?[post]:[];videoCursorRef.current=null;
    void fetchVideos(true,post);
  }
  function nextVideo(delta:number){
    const target=Math.max(0,Math.min(videosRef.current.length-1,videoIndex+delta));
    if(target===videoIndex)return;
    setVideoDirection(delta>0?1:-1);
    setVideoCommentsOpen(false);
    setVideoIndex(current=>{
      const next=Math.max(0,Math.min(videosRef.current.length-1,current+delta));
      if(next>=videosRef.current.length-3&&videoCursorRef.current)void fetchVideos(false);
      return next;
    });
  }
  useEffect(()=>{
    if(!videoOpen)return;
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){if(videoCommentsOpen)setVideoCommentsOpen(false);else setVideoOpen(false);return;}
      if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();nextVideo(event.key==='ArrowDown'?1:-1);
      }
    };
    window.addEventListener('keydown',key);
    return ()=>window.removeEventListener('keydown',key);
  },[videoOpen,videoCommentsOpen,fetchVideos]);
  function wheelVideo(event:WheelEvent){if(Math.abs(event.deltaY)<16||Date.now()-wheelAt.current<480)return;wheelAt.current=Date.now();nextVideo(event.deltaY>0?1:-1);}
  function touchStart(event:TouchEvent){gesture.current=event.touches[0]?.clientY??null;}
  function touchEnd(event:TouchEvent){if(gesture.current===null)return;const diff=gesture.current-(event.changedTouches[0]?.clientY??gesture.current);gesture.current=null;if(Math.abs(diff)>65)nextVideo(diff>0?1:-1);}
  const activeVideo=videos[Math.min(videoIndex,Math.max(0,videos.length-1))];
  const activeVideoMedia=activeVideo?.media.find(item=>item.type.startsWith('video/'));
  const cacheWindowIds=[
    activeVideoMedia?.id,
    videos[videoIndex+1]?.media.find(item=>item.type.startsWith('video/'))?.id,
    videos[videoIndex-1]?.media.find(item=>item.type.startsWith('video/'))?.id
  ].filter((id):id is string=>!!id);
  const cacheWindowKey=cacheWindowIds.join(',');
  // Prioritize the playing video, then fetch the next clip before the user swipes.
  // The previous clip stays pinned for immediate backward navigation.
  useEffect(()=>{
    if(!videoOpen||!active){setFeedVideoCacheWindow([]);return;}
    const urls=cacheWindowKey.split(',').filter(Boolean).map(mediaUrl);
    setFeedVideoCacheWindow(urls);
    let cancelled=false;
    void (async()=>{
      for(const url of urls){
        if(cancelled)return;
        await ensureChatMediaCached(url);
      }
    })();
    return ()=>{cancelled=true;};
  },[videoOpen,active,cacheWindowKey]);
  useEffect(()=>()=>setFeedVideoCacheWindow([]),[]);
  const date=(raw:string)=>new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(raw));

  return <div className="relative h-full min-h-0 w-full">
    <div ref={scrollRef} className="h-full min-h-0 overflow-y-auto overscroll-contain bg-background" data-feed-scroll>
      <div className="mx-auto max-w-2xl space-y-4 px-3 py-4 pb-28 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between gap-2">
          <div><h2 className="text-xl font-bold sm:text-2xl">{pt?'Seu feed':'Your feed'}</h2>
            <p className="text-xs text-muted-foreground">{pt?'Pessoas, fotos, histórias e vídeos.':'People, photos, stories and videos.'}</p></div>
          <Button variant="outline" onClick={()=>openVideo()} disabled={!feedReady} className="gap-2" size="sm"><Video className="size-4"/>{pt?'Vídeos':'Videos'}</Button>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
          <form onSubmit={publish} className="space-y-3">
            <div className="flex items-start gap-2">
              <UserAvatar name={ownName} image={ownAvatar} size="sm"/>
              <textarea value={draft} onChange={e=>setDraft(e.target.value)} disabled={posting||!feedReady} maxLength={4000} rows={3}
                placeholder={pt?'O que você quer compartilhar?':'What would you like to share?'}
                aria-label={pt?'Nova publicação':'New post'}
                className="min-h-24 min-w-0 flex-1 resize-y rounded-xl border border-input bg-background p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/40"/>
            </div>
            {!!preview.length&&<div className="grid grid-cols-3 gap-2">
              {preview.map((url,i)=><div key={url} className="relative overflow-hidden rounded-xl bg-muted">
                {files[i]?.type.startsWith('video/')?<video src={url} preload="metadata" className="aspect-square w-full object-cover"/>:
                  <img src={url} alt={'Anexo '+(i+1)} className="aspect-square w-full object-cover"/>}
                <button type="button" aria-label={pt?'Remover mídia':'Remove media'} disabled={posting||!!draftId}
                  onClick={()=>setFiles(old=>old.filter((_,k)=>k!==i))}
                  className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/75 text-white"><X className="size-4"/></button>
              </div>)}
            </div>}
            {uploadProgress&&<p className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner className="size-3.5"/>{uploadProgress}</p>}
            {draftId&&!posting&&<div className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span>{pt?'Envio pendente salvo. Você pode tentar publicar novamente.':'Pending upload saved. You can retry publishing.'}</span>
              <button type="button" onClick={()=>void discardPendingDraft()} className="shrink-0 font-semibold text-destructive hover:underline">{pt?'Descartar':'Discard'}</button>
            </div>}
            <div className="flex items-center justify-between gap-2">
              <button type="button" disabled={posting||!feedReady||!!draftId} onClick={()=>fileRef.current?.click()}
                className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-accent">
                <ImagePlus className="size-5"/>{pt?'Foto ou vídeo':'Photo or video'}</button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/webm,video/quicktime"
                multiple className="sr-only" onChange={selectFiles}/>
              <Button type="submit" disabled={posting||!feedReady||(!draft.trim()&&!files.length)} loading={posting} className="gap-2">
                <Send className="size-4"/>{pt?'Publicar':'Post'}
              </Button>
            </div>
          </form>
        </div>
        <div className="flex gap-2 border-b border-border pb-2">
          <Button size="sm" variant={filter==='for-you'?'secondary':'ghost'} onClick={()=>changeFilter('for-you')}
            aria-pressed={filter==='for-you'}>{pt?'Para você':'For you'}</Button>
          <Button size="sm" variant={filter==='following'?'secondary':'ghost'} onClick={()=>changeFilter('following')}
            aria-pressed={filter==='following'}>{pt?'Seguindo':'Following'}</Button>
        </div>
        {notice&&<div role="status" className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
          <span>{notice}</span><button type="button" onClick={()=>setNotice('')} aria-label={pt?'Fechar':'Close'}><X className="size-4"/></button>
        </div>}
        {error&&<div role="status" className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
          <span>{error}</span><button type="button" onClick={()=>setError('')} aria-label={pt?'Fechar':'Close'}><X className="size-4"/></button>
        </div>}
        {loading&&<SkeletonRows rows={5}/>}
        {!loading&&!error&&!posts.length&&<div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {pt?'Ainda não há publicações. Compartilhe a primeira!':'No posts yet. Share the first one!'}
        </div>}
        {posts.map(post=><article key={post.id} className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
          <header className="flex items-center gap-3">
            <a href={'/@'+post.authorHandle} target="_blank" rel="noopener noreferrer" aria-label={'@'+post.authorHandle}>
              <UserAvatar name={post.authorName} image={post.authorAvatar} size="sm"/></a>
            <div className="min-w-0 flex-1">
              <a className="block truncate text-sm font-semibold hover:underline" href={'/@'+post.authorHandle} target="_blank" rel="noopener noreferrer">{post.authorName}</a>
              <span className="text-xs text-muted-foreground">@{post.authorHandle} · {date(post.publishedAt)}</span>
            </div>
            {!post.mine&&<Button type="button" size="sm" variant={post.following?'secondary':'outline'}
              disabled={followBusy===post.authorHandle} loading={followBusy===post.authorHandle}
              onClick={()=>void toggleFollow(post)} aria-pressed={post.following}
              className="shrink-0 text-xs">{post.following?(pt?'Seguindo':'Following'):(pt?'Seguir':'Follow')}</Button>}
            {post.mine&&<div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="ghost" disabled={editBusy} onClick={()=>{
                if(editingPost===post.id){setEditingPost(null);setEditingBody('');}
                else{setEditingPost(post.id);setEditingBody(post.body);}
              }} className="text-xs text-muted-foreground">{editingPost===post.id?(pt?'Voltar':'Cancel'):(pt?'Editar':'Edit')}</Button>
              <Button size="sm" variant="ghost" onClick={()=>void removePost(post)} className="gap-1 text-xs text-muted-foreground">
                <Trash2 className="size-4"/>{deleting===post.id?(pt?'Confirmar':'Confirm'):(pt?'Excluir':'Delete')}</Button>
            </div>}
          </header>
          {editingPost===post.id?<form onSubmit={event=>void updatePostBody(event,post)} className="mt-3 space-y-2">
            <textarea aria-label={pt?'Editar publicação':'Edit post'} value={editingBody}
              onChange={event=>setEditingBody(event.target.value)} rows={3} maxLength={4000}
              className="min-h-20 w-full resize-y rounded-xl border border-input bg-background p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/40"/>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={()=>{setEditingPost(null);setEditingBody('');}}>{pt?'Cancelar':'Cancel'}</Button>
              <Button type="submit" size="sm" loading={editBusy} disabled={editBusy||(!editingBody.trim()&&!post.media.length)}>{pt?'Salvar':'Save'}</Button>
            </div>
          </form>:post.body&&<p className="mt-3 whitespace-pre-wrap wrap-break-word text-sm leading-6 sm:text-base">{post.body}</p>}
          <PostGallery post={post} onZoom={setZoom}/>
          <FeedVideo post={post} open={()=>openVideo(post)} paused={videoOpen||!active}/>
          <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border/70 pt-2">
            <Button type="button" size="sm" variant="ghost" disabled={likeBusy===post.id}
              onClick={()=>void toggleLike(post)} className={post.liked?'text-rose-500':''}
              aria-pressed={post.liked}><Heart className="size-4" fill={post.liked?'currentColor':'none'}/>{post.likeCount}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={()=>void showComments(post)}>
              <MessageCircle className="size-4"/>{post.commentCount}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={()=>void share(post)}>
              <Share2 className="size-4"/>{pt?'Compartilhar':'Share'}</Button>
          </div>
          {openComments===post.id&&<section className="mt-2 space-y-3 border-t border-border pt-3" aria-label={pt?'Comentários':'Comments'}>
            {(comments[post.id]??[]).map(comment=><div key={comment.id} className="flex items-start gap-2 text-sm">
              {comment.deleted?<p className="flex-1 rounded-lg bg-muted/50 px-3 py-2 text-xs italic text-muted-foreground">
                {pt?'Um comentário foi excluído.':'A comment was deleted.'}
              </p>:<>
                <UserAvatar name={comment.authorName??''} image={comment.authorAvatar} size="sm"/>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold">{comment.authorName}</span><span className="ml-1 text-xs text-muted-foreground">@{comment.authorHandle}</span>
                  <p className="mt-1 whitespace-pre-wrap wrap-break-word">{comment.body}</p>
                </div>
              </>}
              {comment.canDelete&&!comment.deleted&&<button type="button" onClick={()=>setDeleteCandidate({postId:post.id,commentId:comment.id})}
                aria-label={pt?'Excluir comentário':'Delete comment'} className="p-2 text-muted-foreground"><Trash2 className="size-4"/></button>}
            </div>)}
            <form onSubmit={event=>void sendComment(event,post)} className="flex gap-2">
              <input value={commentDraft} onChange={event=>setCommentDraft(event.target.value)} maxLength={1000}
                onFocus={event=>commentFocus(event.currentTarget)}
                onBlur={()=>{setCommentFocused(false);onCommentFocusChange?.(false);}}
                placeholder={pt?'Escrever comentário…':'Write a comment…'} aria-label={pt?'Comentário':'Comment'}
                className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base outline-none"/>
              <Button type="submit" size="icon" loading={commentBusy} disabled={commentBusy||!commentDraft.trim()} aria-label={pt?'Enviar comentário':'Send comment'}>
                {!commentBusy&&<Send className="size-4"/>}</Button>
            </form>
          </section>}
        </article>)}
        <div ref={bottomRef} className="flex min-h-10 items-center justify-center py-3 text-xs text-muted-foreground">
          {loadingMore?<Spinner className="size-5"/>:(!hasMore&&!loading&&posts.length>0?(pt?'Você está em dia.':'You are all caught up.'):null)}
        </div>
        {!loading&&hasMore&&<Button variant="outline" className="mx-auto flex" onClick={()=>void loadMore()} disabled={loadingMore}>
          <ArrowDown className="size-4"/>{pt?'Mais publicações':'More posts'}</Button>}
      </div>
    </div>
    {videoOpen&&<div role="dialog" aria-modal="true" aria-label={pt?'Modo Vídeos':'Video mode'}
      className="fixed inset-x-0 top-[var(--uorqui-app-top,0px)] z-[130] flex h-[var(--uorqui-app-height,100dvh)] flex-col bg-black text-white" onWheel={wheelVideo} onTouchStart={touchStart} onTouchEnd={touchEnd}>
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={()=>setVideoOpen(false)} className="flex min-h-11 items-center gap-2 px-2 text-sm" aria-label={pt?'Voltar ao feed':'Back to feed'}>
          <ArrowLeft className="size-5"/>{pt?'Voltar':'Back'}</button>
        <strong className="text-sm">{pt?'Vídeos':'Videos'}</strong><span className="text-xs opacity-75">{videos.length?videoIndex+1+'/'+videos.length:''}</span>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
      <AnimatePresence initial={false} custom={videoDirection}>
      {activeVideo&&activeVideoMedia?<motion.div key={activeVideo.id} custom={videoDirection}
        variants={{
          enter:(direction:number)=>({y:direction>0?'100%':'-100%',opacity:0.85}),
          center:{y:'0%',opacity:1},
          exit:(direction:number)=>({y:direction>0?'-100%':'100%',opacity:0.85})
        }}
        initial="enter" animate="center" exit="exit"
        transition={{duration:0.32,ease:[0.22,1,0.36,1]}}
        className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <ExpandedFeedVideo mediaId={activeVideoMedia.id} pt={pt}/>
        <div className="pointer-events-none absolute bottom-12 left-3 max-w-[75%] space-y-1 bg-gradient-to-t from-black/60 to-transparent p-2 text-sm">
          <strong>@{activeVideo.authorHandle}</strong><p className="line-clamp-3 whitespace-pre-wrap">{activeVideo.body}</p>
        </div>
        <div className="absolute bottom-16 right-3 flex flex-col gap-2">
          <button type="button" className="grid size-11 place-items-center rounded-full bg-black/60"
            onClick={()=>void toggleLike(activeVideo)} aria-label={pt?'Curtir':'Like'}><Heart className="size-6" fill={activeVideo.liked?'currentColor':'none'}/><span className="text-[10px]">{activeVideo.likeCount}</span></button>
          <button type="button" className="flex size-11 flex-col items-center justify-center rounded-full bg-black/60"
            onClick={()=>void openVideoComments(activeVideo)} aria-label={pt?'Comentários':'Comments'}>
            <MessageCircle className="size-5"/><span className="text-[10px]">{activeVideo.commentCount}</span></button>
          <button type="button" className="grid size-11 place-items-center rounded-full bg-black/60"
            onClick={()=>void share(activeVideo)} aria-label={pt?'Compartilhar':'Share'}><Share2 className="size-5"/></button>
        </div>
      </motion.div>:<div className="absolute inset-0 flex items-center justify-center text-sm">{videoLoading?<Spinner/>:(pt?'Nenhum vídeo disponível.':'No videos yet.')}</div>}
      </AnimatePresence>
      </div>
      <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3">
        <button type="button" onClick={()=>nextVideo(-1)} disabled={videoIndex===0} aria-label={pt?'Vídeo anterior':'Previous video'}
          className="grid size-10 rotate-90 place-items-center rounded-full bg-black/60 disabled:opacity-30"><ChevronLeft className="size-5"/></button>
        <button type="button" onClick={()=>nextVideo(1)} disabled={videoIndex>=videos.length-1} aria-label={pt?'Próximo vídeo':'Next video'}
          className="grid size-10 rotate-90 place-items-center rounded-full bg-black/60 disabled:opacity-30"><ChevronRight className="size-5"/></button>
      </div>
      {videoCommentsOpen&&activeVideo&&<section aria-label={pt?'Comentários do vídeo':'Video comments'}
        className="absolute inset-x-0 bottom-0 z-40 flex max-h-[75dvh] flex-col rounded-t-2xl border-t border-white/20 bg-card text-foreground shadow-2xl"
        onWheel={event=>event.stopPropagation()} onTouchStart={event=>event.stopPropagation()} onTouchEnd={event=>event.stopPropagation()}>
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <strong className="text-sm">{pt?'Comentários':'Comments'} · {activeVideo.commentCount}</strong>
          <button type="button" aria-label={pt?'Fechar comentários':'Close comments'} onClick={()=>setVideoCommentsOpen(false)}
            className="grid size-9 place-items-center"><X className="size-5"/></button>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {(comments[activeVideo.id]??[]).map(comment=><div key={comment.id} className="flex items-start gap-2 text-sm">
            {comment.deleted?<p className="flex-1 rounded-lg bg-muted/50 px-3 py-2 text-xs italic text-muted-foreground">
              {pt?'Um comentário foi excluído.':'A comment was deleted.'}
            </p>:<>
              <UserAvatar name={comment.authorName??''} image={comment.authorAvatar} size="sm"/>
              <div className="min-w-0 flex-1"><strong>{comment.authorName}</strong>
                <span className="ml-2 text-xs text-muted-foreground">@{comment.authorHandle}</span>
                <p className="mt-1 whitespace-pre-wrap wrap-break-word">{comment.body}</p></div>
            </>}
            {comment.canDelete&&!comment.deleted&&<button type="button" aria-label={pt?'Excluir comentário':'Delete comment'}
              onClick={()=>setDeleteCandidate({postId:activeVideo.id,commentId:comment.id})}><Trash2 className="size-4"/></button>}
          </div>)}
          {!(comments[activeVideo.id]??[]).length&&<p className="text-center text-xs text-muted-foreground">{pt?'Ainda não há comentários.':'No comments yet.'}</p>}
        </div>
        <form className="flex shrink-0 gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={event=>void sendComment(event,activeVideo)}>
          <input value={commentDraft} onChange={event=>setCommentDraft(event.target.value)} maxLength={1000}
            onFocus={event=>commentFocus(event.currentTarget)}
            onBlur={()=>{setCommentFocused(false);onCommentFocusChange?.(false);}}
            aria-label={pt?'Comentário':'Comment'} placeholder={pt?'Escrever comentário…':'Write a comment…'}
            className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base outline-none"/>
          <Button size="icon" type="submit" disabled={!commentDraft.trim()||commentBusy} loading={commentBusy}
            aria-label={pt?'Enviar comentário':'Send comment'}>{!commentBusy&&<Send className="size-4"/>}</Button>
        </form>
      </section>}
      {videoLoading&&<span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs opacity-70">{pt?'Carregando vídeos…':'Loading videos…'}</span>}
    </div>}
    {deleteCandidate&&<div role="dialog" aria-modal="true" aria-label={pt?'Excluir comentário':'Delete comment'}
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl" role="document">
        <h3 className="text-base font-semibold">{pt?'Excluir comentário?':'Delete comment?'}</h3>
        <p className="text-sm text-muted-foreground">{comments[deleteCandidate.postId]?.some(c=>c.id===deleteCandidate.commentId&&c.mine)
          ?(pt?'Seu comentário será removido por completo, sem deixar um aviso.':'Your comment will disappear completely, without a notice.')
          :(pt?'O texto do comentário será removido, mas ficará um aviso informando que um comentário foi excluído.':
            'The comment text will be removed, but a deleted-comment notice will remain.')}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={deleteBusy} onClick={()=>setDeleteCandidate(null)}>
            {pt?'Cancelar':'Cancel'}</Button>
          <Button type="button" variant="destructive" loading={deleteBusy} disabled={deleteBusy}
            onClick={()=>{
              const post=[...posts,...videos].find(p=>p.id===deleteCandidate.postId);
              if(post)void removeComment(post,deleteCandidate.commentId);
            }}>{pt?'Excluir':'Delete'}</Button>
        </div>
      </div>
    </div>}
    {zoom&&<div role="dialog" aria-modal="true" aria-label={pt?'Visualizador de foto':'Photo viewer'} className="fixed inset-0 z-[140] flex flex-col bg-black/95 text-white">
      <div className="flex h-12 shrink-0 justify-end p-1"><button type="button" onClick={()=>setZoom(null)} aria-label={pt?'Fechar foto':'Close photo'}
        className="grid size-10 place-items-center"><X className="size-6"/></button></div>
      <div className="min-h-0 flex-1"><ZoomableChatImage src={zoom} alt={pt?'Foto da publicação':'Post image'} locale={locale}/></div>
    </div>}
  </div>;
}
