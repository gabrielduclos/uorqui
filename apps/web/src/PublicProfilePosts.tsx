import { useEffect, useRef, useState } from 'react';
import { FileText, Heart, Images, LockKeyhole, MessageCircle, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useCachedChatMedia, useCachedFeedVideo } from './chatMediaCache';
import { useUorquiPreferences } from './UorquiPreferences';

type Media={id:string;type:string;position:number};
type Post={
  id:string;body:string;publishedAt:string;likeCount:number;commentCount:number;
  authorName:string;authorHandle:string;media:Media[];
};
const mediaUrl=(id:string)=>'/media/feed/'+id;

function Thumbnail({post,onOpen,pt}:{post:Post;onOpen:()=>void;pt:boolean}){
  const ref=useRef<HTMLButtonElement>(null);
  const [nearby,setNearby]=useState(false);
  const media=post.media[0];
  const image=media?.type.startsWith('image/')?media:null;
  const video=media?.type.startsWith('video/')?media:null;
  const src=useCachedChatMedia(image?mediaUrl(image.id):null,nearby);
  useEffect(()=>{
    const node=ref.current;
    if(!node)return;
    if(typeof IntersectionObserver==='undefined'){setNearby(true);return;}
    const observer=new IntersectionObserver(entries=>setNearby(!!entries[0]?.isIntersecting),
      {rootMargin:'250px'});
    observer.observe(node);
    return ()=>observer.disconnect();
  },[]);
  return <button ref={ref} type="button" onClick={onOpen}
    aria-label={(pt?'Abrir publicação':'Open post')+' '+post.body.slice(0,60)}
    className="group relative aspect-square min-w-0 overflow-hidden rounded-md bg-muted text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
    {image&&(src?<img src={src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"/>:
      <span className="absolute inset-0 animate-pulse bg-muted-foreground/10"/>)}
    {video&&<video src={nearby?mediaUrl(video.id):undefined} muted playsInline preload="metadata"
      aria-hidden="true" className="pointer-events-none h-full w-full object-cover"/>}
    {!media&&<span className="flex h-full flex-col justify-center gap-2 p-3 text-foreground">
      <FileText className="size-5 text-primary"/><span className="line-clamp-5 break-words text-xs leading-5 sm:text-sm">{post.body}</span>
    </span>}
    {video&&<span className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"><Play className="size-4" fill="currentColor"/></span>}
    {post.media.length>1&&<Images className="absolute right-2 top-2 size-5 text-white drop-shadow-lg"/>}
    <span className="absolute inset-x-0 bottom-0 flex justify-end gap-3 bg-gradient-to-t from-black/75 to-transparent px-2 pb-2 pt-7 text-[11px] text-white opacity-90">
      <span className="flex items-center gap-1"><Heart className="size-3"/>{post.likeCount}</span>
      <span className="flex items-center gap-1"><MessageCircle className="size-3"/>{post.commentCount}</span>
    </span>
  </button>;
}

function Preview({post,close,pt}:{post:Post;close:()=>void;pt:boolean}){
  const [index,setIndex]=useState(0);
  const media=post.media[index];
  const imageSrc=useCachedChatMedia(media?.type.startsWith('image/')?mediaUrl(media.id):null);
  const videoSource=useCachedFeedVideo(media?.type.startsWith('video/')?mediaUrl(media.id):null);
  return <div role="dialog" aria-modal="true" aria-label={pt?'Publicação':'Post'}
    className="fixed inset-0 z-[150] flex flex-col bg-black/95 text-white"
    onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
    <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-white/15 px-3 sm:px-6">
      <div className="min-w-0"><strong className="block truncate text-sm">{post.authorName}</strong>
        <span className="block truncate text-xs text-white/70">@{post.authorHandle}</span></div>
      <button type="button" onClick={close} aria-label={pt?'Fechar publicação':'Close post'}
        className="grid size-11 place-items-center rounded-full hover:bg-white/15"><X className="size-6"/></button>
    </header>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row">
      {media?<div className="relative flex min-h-[45dvh] flex-1 items-center justify-center bg-black sm:min-h-0">
        {media.type.startsWith('image/')&&(imageSrc?
          <img src={imageSrc} alt={pt?'Imagem da publicação':'Post image'} className="max-h-[75dvh] max-w-full object-contain"/>:
          <Spinner className="size-7"/>)}
        {media.type.startsWith('video/')&&(videoSource.src?
          <video src={videoSource.src} autoPlay controls playsInline disablePictureInPicture disableRemotePlayback
            controlsList="nodownload nofullscreen noremoteplayback" className="max-h-[75dvh] max-w-full object-contain"/>:
          <Spinner className="size-7"/>)}
        {post.media.length>1&&<div className="absolute inset-x-3 bottom-3 flex justify-between gap-2">
          <Button size="sm" variant="secondary" onClick={()=>setIndex(i=>(i+post.media.length-1)%post.media.length)}>
            {pt?'Anterior':'Previous'}</Button>
          <span className="self-center rounded-full bg-black/60 px-2 py-1 text-xs">{index+1}/{post.media.length}</span>
          <Button size="sm" variant="secondary" onClick={()=>setIndex(i=>(i+1)%post.media.length)}>
            {pt?'Próxima':'Next'}</Button>
        </div>}
      </div>:null}
      <aside className="w-full shrink-0 space-y-3 p-4 sm:w-72 sm:overflow-y-auto sm:p-5">
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{post.body}</p>
        <div className="flex gap-4 border-t border-white/15 pt-3 text-sm text-white/75">
          <span className="flex items-center gap-1.5"><Heart className="size-4"/>{post.likeCount}</span>
          <span className="flex items-center gap-1.5"><MessageCircle className="size-4"/>{post.commentCount}</span>
        </div>
        <a href={'/?post='+encodeURIComponent(post.id)}
          className="inline-flex min-h-10 items-center text-sm font-medium text-white underline underline-offset-4">
          {pt?'Ver no feed':'View in feed'}
        </a>
      </aside>
    </div>
  </div>;
}

export function PublicProfilePosts({handle,canView}:{handle:string;canView:boolean}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [posts,setPosts]=useState<Post[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<Post|null>(null);
  useEffect(()=>{
    setPosts([]);setCursor(null);setError('');setLoading(true);setSelected(null);
    if(!canView){setLoading(false);return;}
    const controller=new AbortController();
    void fetch('/api/v1/feed/posts?author='+encodeURIComponent(handle),{
      credentials:'same-origin',cache:'no-store',signal:controller.signal
    }).then(async response=>{
      if(!response.ok)throw Error(String(response.status));
      return response.json() as Promise<{posts:Post[];nextCursor:string|null}>;
    }).then(data=>{if(!controller.signal.aborted){setPosts(data.posts);setCursor(data.nextCursor);}})
      .catch(()=>{if(!controller.signal.aborted)setError(pt?'Não foi possível carregar publicações.':'Could not load posts.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[handle,canView,pt]);
  useEffect(()=>{
    if(!selected)return;
    const prior=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelected(null);};
    window.addEventListener('keydown',onKey);
    return ()=>{document.body.style.overflow=prior;window.removeEventListener('keydown',onKey);};
  },[selected]);

  async function more(){
    if(!cursor||busy)return;
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/v1/feed/posts?author='+encodeURIComponent(handle)+'&cursor='+encodeURIComponent(cursor),
        {credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw Error('Load failed');
      const data=await response.json() as {posts:Post[];nextCursor:string|null};
      setPosts(old=>[...old,...data.posts.filter(post=>!old.some(p=>p.id===post.id))]);
      setCursor(data.nextCursor);
    }catch{setError(pt?'Não foi possível carregar mais publicações.':'Could not load more posts.');}
    finally{setBusy(false);}
  }
  return <section aria-label={pt?'Publicações do perfil':'Profile posts'} className="space-y-3">
    <h2 className="text-base font-semibold">{pt?'Publicações':'Posts'}</h2>
    {!canView?<p className="flex items-center gap-2 rounded-lg border border-border p-4 text-sm text-muted-foreground">
      <LockKeyhole className="size-4"/>{pt?'Entre na sua conta para visualizar as publicações e mídias.':'Sign in to view posts and media.'}
    </p>:<>
      {loading&&<div role="status" aria-label={pt?'Carregando publicações':'Loading posts'} className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {Array.from({length:6},(_,i)=><div key={i} className="aspect-square animate-pulse rounded-md bg-muted"/>)}
      </div>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {!loading&&!posts.length&&!error&&<p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
        {pt?'Nenhuma publicação pública ainda.':'No public posts yet.'}
      </p>}
      {!!posts.length&&<div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {posts.map(post=><Thumbnail key={post.id} post={post} onOpen={()=>setSelected(post)} pt={pt}/>)}
      </div>}
      {cursor&&<Button variant="outline" className="w-full" disabled={busy} loading={busy} onClick={()=>void more()}>
        {pt?'Carregar mais publicações':'Load more posts'}
      </Button>}
    </>}
    {selected&&<Preview key={selected.id} post={selected} close={()=>setSelected(null)} pt={pt}/>}
  </section>;
}
