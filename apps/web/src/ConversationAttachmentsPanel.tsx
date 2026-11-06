import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, FileAudio, FileText, Image as ImageIcon, LoaderCircle, MessageCircle, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCachedChatMedia } from './chatMediaCache';
import { ChatMediaViewer } from './ChatMediaViewer';
import type { DirectChatMessage } from './DirectMessageBubble';

type Attachment = { id:string; name:string; type:string; size:number };
type GalleryItem = {
  id:string; conversationId:string; authorId:string; body:string; createdAt:string;
  attachment:Attachment;
};
type GalleryResponse = {items:GalleryItem[];nextCursor:string|null};
type Category = 'media'|'files';

function uri(item:GalleryItem) {
  return '/media/dm/'+encodeURIComponent(item.conversationId)+'/'+encodeURIComponent(item.attachment.id);
}
function isPicture(item:GalleryItem){return item.attachment.type.startsWith('image/');}
function isVideo(item:GalleryItem){return item.attachment.type.startsWith('video/');}
function isAudio(item:GalleryItem){return item.attachment.type.startsWith('audio/');}
function prettySize(bytes:number){
  if(bytes>=1048576)return (bytes/1048576).toFixed(1)+' MB';
  if(bytes>=1024)return Math.round(bytes/1024)+' KB';
  return Math.max(0,bytes)+' B';
}
function GalleryPhoto({item,onClick,pt}:{item:GalleryItem;onClick:()=>void;pt:boolean}){
  const source=uri(item);
  const cached=useCachedChatMedia(source,true);
  return <button type="button" onClick={onClick}
    aria-label={(pt?'Ampliar ':'Open ')+item.attachment.name}
    className="group relative flex min-h-36 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
    <span className="grid h-32 w-full place-items-center overflow-hidden bg-muted/50">
      {cached?<img src={cached} alt={item.attachment.name} loading="lazy"
        className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"/>:
        <ImageIcon className="size-7 text-muted-foreground"/>}
    </span>
    <span className="min-w-0 w-full px-2 py-2">
      <span className="block truncate text-xs font-medium">{item.attachment.name}</span>
      <span className="block truncate text-[11px] text-muted-foreground">{prettySize(item.attachment.size)}</span>
    </span>
  </button>;
}
function GalleryVideo({item,onClick,pt}:{item:GalleryItem;onClick:()=>void;pt:boolean}){
  return <button type="button" onClick={onClick}
    aria-label={(pt?'Abrir vídeo ':'Open video ')+item.attachment.name}
    className="group flex min-h-36 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
    <span className="grid h-32 w-full place-items-center bg-muted/50">
      <Video className="size-8 text-muted-foreground"/>
    </span>
    <span className="min-w-0 w-full px-2 py-2">
      <span className="block truncate text-xs font-medium">{item.attachment.name}</span>
      <span className="block truncate text-[11px] text-muted-foreground">{prettySize(item.attachment.size)}</span>
    </span>
  </button>;
}
export function ConversationAttachmentsPanel({
  conversationId,locale,peerName,onClose,onJump
}:{
  conversationId:string;locale:string;peerName:string;onClose:()=>void;onJump:(messageId:string)=>void;
}){
  const pt=locale==='pt-BR';
  const [category,setCategory]=useState<Category>('media');
  const [items,setItems]=useState<GalleryItem[]>([]);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const requestRef=useRef<AbortController|null>(null);

  const fetchPage=useCallback(async(cursor:string|null,signal:AbortSignal)=>{
    const params=new URLSearchParams({kind:category});
    if(cursor)params.set('before',cursor);
    const response=await fetch('/api/v1/dm/conversations/'+encodeURIComponent(conversationId)+
      '/attachments?'+params.toString(),{credentials:'same-origin',cache:'no-store',signal});
    if(!response.ok)throw Error('GALLERY_UNAVAILABLE');
    return response.json() as Promise<GalleryResponse>;
  },[conversationId,category]);

  useEffect(()=>{
    const controller=new AbortController();
    requestRef.current?.abort();
    requestRef.current=controller;
    setItems([]);setNextCursor(null);setError('');setSelectedId(null);setLoading(true);
    void fetchPage(null,controller.signal).then(page=>{
      if(controller.signal.aborted)return;
      setItems(page.items);setNextCursor(page.nextCursor);
    }).catch(()=>{
      if(!controller.signal.aborted)setError(pt?'Não foi possível carregar os anexos.':'Could not load attachments.');
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>{controller.abort();};
  },[fetchPage,pt]);
  async function more(){
    if(loading||!nextCursor)return;
    const controller=new AbortController();
    requestRef.current=controller;
    setLoading(true);setError('');
    try{
      const page=await fetchPage(nextCursor,controller.signal);
      if(controller.signal.aborted)return;
      setItems(previous=>{
        const ids=new Set(previous.map(item=>item.id));
        return [...previous,...page.items.filter(item=>!ids.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    }catch{if(!controller.signal.aborted)setError(pt?'Não foi possível carregar mais anexos.':'Could not load more attachments.');}
    finally{if(!controller.signal.aborted)setLoading(false);}
  }
  const viewable=useMemo<DirectChatMessage[]>(()=>items.filter(item=>isPicture(item)||isVideo(item))
    .map(item=>({id:item.id,conversationId:item.conversationId,authorId:item.authorId,
      body:item.body,clientId:null,createdAt:item.createdAt,readAt:null,deliveredAt:null,
      editedAt:null,deletedAt:null,forwarded:false,reactions:[],myReaction:null,attachment:item.attachment}))
    .reverse(),[items]);

  return <section aria-label={pt?'Mídias e arquivos da conversa':'Conversation media and files'}
    className="absolute inset-0 z-40 flex min-h-0 flex-col overflow-hidden bg-card text-card-foreground">
    <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-3 sm:px-5">
      <Button type="button" variant="ghost" size="icon" onClick={onClose}
        aria-label={pt?'Voltar à conversa':'Back to chat'} className="size-9 shrink-0">
        <ArrowLeft className="size-5"/>
      </Button>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{pt?'Mídias e arquivos':'Media and files'}</h2>
        <p className="truncate text-xs text-muted-foreground">{peerName}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onClose}
        aria-label={pt?'Fechar galeria':'Close gallery'} className="size-9 shrink-0">
        <X className="size-4"/>
      </Button>
    </header>
    <div role="tablist" aria-label={pt?'Tipos de anexos':'Attachment categories'}
      className="flex shrink-0 gap-1 border-b border-border px-3 py-2 sm:px-5">
      {(['media','files'] as const).map(kind=><button type="button" role="tab" key={kind}
        aria-selected={category===kind} onClick={()=>setCategory(kind)}
        className={'min-h-9 flex-1 rounded-md px-3 text-xs font-semibold transition-colors sm:flex-none '+
          (category===kind?'bg-secondary text-foreground':'text-muted-foreground hover:bg-accent hover:text-foreground')}>
        {kind==='media'?(pt?'Mídias':'Media'):(pt?'Arquivos':'Files')}
      </button>)}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
      {category==='media'?<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {items.filter(item=>isPicture(item)).map(item=><GalleryPhoto key={item.id} item={item} pt={pt}
          onClick={()=>setSelectedId(item.id)}/>)}
        {items.filter(item=>isVideo(item)).map(item=><GalleryVideo key={item.id} item={item} pt={pt}
          onClick={()=>setSelectedId(item.id)}/>)}
      </div>:null}
      {category==='media'&&items.some(isAudio)&&<div className="mt-4 space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground">{pt?'Áudios':'Audio'}</h3>
        {items.filter(isAudio).map(item=><div key={item.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
          <FileAudio className="size-5 shrink-0 text-muted-foreground"/>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{item.attachment.name}</p>
            <audio controls preload="none" src={uri(item)} className="mt-2 h-9 w-full" aria-label={item.attachment.name}/>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={()=>onJump(item.id)}
            aria-label={pt?'Ver na conversa':'View in chat'}><MessageCircle className="size-4"/></Button>
        </div>)}
      </div>}
      {category==='files'&&<div className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border bg-background">
        {items.map(item=><div key={item.id} className="flex min-w-0 items-center gap-3 px-3 py-3">
          <FileText className="size-5 shrink-0 text-muted-foreground"/>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={item.attachment.name}>{item.attachment.name}</p>
            <p className="text-xs text-muted-foreground">{prettySize(item.attachment.size)}</p>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={()=>onJump(item.id)}
            aria-label={pt?'Ver mensagem do arquivo':'View file message'}><MessageCircle className="size-4"/></Button>
          <a href={uri(item)} download={item.attachment.name} aria-label={(pt?'Baixar ':'Download ')+item.attachment.name}
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Download className="size-4"/></a>
        </div>)}
      </div>}
      {!loading&&!error&&items.length===0&&<div className="flex flex-col items-center gap-2 py-16 text-center">
        {category==='media'?<ImageIcon className="size-9 text-muted-foreground"/>:<FileText className="size-9 text-muted-foreground"/>}
        <p className="text-sm font-medium">{pt?'Nenhum anexo nesta categoria':'No attachments in this category'}</p>
      </div>}
      {error&&<p role="alert" className="rounded-md border border-destructive/40 px-3 py-3 text-sm text-destructive">{error}</p>}
      {loading&&<div role="status" className="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin"/>{pt?'Carregando…':'Loading…'}
      </div>}
      {!loading&&nextCursor&&<Button type="button" variant="outline" onClick={()=>void more()}
        className="mt-5 w-full">{pt?'Carregar mais':'Load more'}</Button>}
    </div>
    <ChatMediaViewer items={viewable.filter(item=>item.attachment!=null) as (DirectChatMessage & {attachment:Attachment})[]}
      selectedId={selectedId} onSelect={setSelectedId} onClose={()=>setSelectedId(null)} locale={locale}/>
  </section>;
}
