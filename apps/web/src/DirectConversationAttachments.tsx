import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Download, FileArchive, FileText, Film, Image as ImageIcon, Mic2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useCachedChatMedia } from './chatMediaCache';
import { ChatMediaViewer } from './ChatMediaViewer';
import type { DirectChatMessage } from './DirectMessageBubble';

type Attachment = NonNullable<DirectChatMessage['attachment']>;
type GalleryMessage = Pick<DirectChatMessage,'id'|'conversationId'|'authorId'|'body'|'createdAt'> & {attachment:Attachment};
type Tab = 'media'|'files';
const isMedia = (type:string) => /^(image|video|audio)\//.test(type);
const isVisual = (type:string) => /^(image|video)\//.test(type);
const assetUrl = (item:GalleryMessage) => '/media/dm/'+item.conversationId+'/'+item.attachment.id;
function mediaDate(item:GalleryMessage,locale:string){
  const date=new Date(item.createdAt);
  return Number.isNaN(date.getTime())?'':date.toLocaleDateString(locale==='pt-BR'?'pt-BR':'en-US',{day:'numeric',month:'short',year:'numeric'});
}
function PreviewTile({item,onOpen,locale}:{item:GalleryMessage;onOpen:()=>void;locale:string}){
  const type=item.attachment.type;
  const picture=type.startsWith('image/');
  const source=assetUrl(item);
  // Private images use the account-scoped in-memory cache, never public storage.
  const cached=useCachedChatMedia(picture?source:null,picture);
  return <button type="button" onClick={onOpen}
    aria-label={(locale==='pt-BR'?'Abrir mídia: ':'Open media: ')+item.attachment.name}
    className="group relative flex aspect-square min-w-0 flex-col items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50 text-foreground hover:border-ring focus-visible:outline-2 focus-visible:outline-ring">
    {picture
      ?(cached?<img src={cached} alt={item.attachment.name} loading="lazy" className="size-full object-cover"/>:
        <ImageIcon aria-hidden="true" className="size-8 text-muted-foreground"/>)
      :<Film aria-hidden="true" className="size-8 text-muted-foreground"/>}
    <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-2 py-1.5 text-left text-[11px] text-white">{item.attachment.name}</span>
  </button>;
}

export function DirectConversationAttachments({conversationId,peerName,locale,onClose,onJump}:{
  conversationId:string;peerName:string;locale:string;onClose:()=>void;onJump:(messageId:string)=>void;
}){
  const pt=locale==='pt-BR';
  const [tab,setTab]=useState<Tab>('media');
  const [items,setItems]=useState<GalleryMessage[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [viewerId,setViewerId]=useState<string|null>(null);
  const abortRef=useRef<AbortController|null>(null);
  const dialogRef=useRef<HTMLDivElement>(null);
  const loadPage=useCallback(async(before?:string)=>{
    abortRef.current?.abort();
    const controller=new AbortController();
    abortRef.current=controller;
    setLoading(true);setError('');
    try{
      const q=new URLSearchParams({kind:tab});
      if(before)q.set('before',before);
      const response=await fetch('/api/v1/dm/conversations/'+encodeURIComponent(conversationId)+'/attachments?'+q,{
        credentials:'same-origin',cache:'no-store',signal:controller.signal
      });
      if(!response.ok)throw Error('Gallery unavailable');
      const payload=await response.json() as {items:GalleryMessage[];nextCursor:string|null};
      if(controller.signal.aborted)return;
      const nextItems=Array.isArray(payload.items)?payload.items.filter(item=>item.attachment&&item.id):[];
      setItems(previous=>before?[...previous,...nextItems.filter(item=>!previous.some(old=>old.id===item.id))]:nextItems);
      setCursor(payload.nextCursor??null);
    }catch{
      if(!controller.signal.aborted)setError(pt?'Não foi possível carregar os anexos. Tente novamente.':'Could not load attachments. Try again.');
    }finally{
      if(!controller.signal.aborted)setLoading(false);
    }
  },[conversationId,tab,pt]);
  useEffect(()=>{
    setViewerId(null);
    setItems([]);
    setCursor(null);
    void loadPage();
    return()=>abortRef.current?.abort();
  },[loadPage]);
  useEffect(()=>{
    const prev=document.activeElement instanceof HTMLElement?document.activeElement:null;
    dialogRef.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!viewerId){event.preventDefault();onClose();}
    };
    window.addEventListener('keydown',onKey);
    return()=>{window.removeEventListener('keydown',onKey);prev?.focus();};
  },[onClose,viewerId]);
  // ChatMediaViewer already validates private R2 access and supports zoom/video.
  const visualItems=items.filter(item=>isVisual(item.attachment.type))
    .map(item=>({
      ...item,clientId:null,readAt:null,deliveredAt:null,editedAt:null,deletedAt:null,
      forwarded:false,reactions:[],myReaction:null
    }));
  return createPortal(<>
    <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/65 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-6"
      onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true"
        aria-label={pt?'Mídias e arquivos da conversa':'Conversation media and files'}
        className="flex h-full max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl outline-none">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{pt?'Mídias e arquivos':'Media and files'}</h2>
            <p className="truncate text-xs text-muted-foreground">{peerName}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}
            aria-label={pt?'Fechar galeria':'Close gallery'}><X className="size-5"/></Button>
        </header>
        <div className="flex shrink-0 gap-1 border-b border-border px-4 py-2" role="tablist"
          aria-label={pt?'Tipo de anexo':'Attachment type'}>
          {(['media','files'] as const).map(value=><button key={value} type="button" role="tab"
            aria-selected={tab===value} onClick={()=>setTab(value)}
            className={'min-h-10 rounded-md px-4 text-sm font-medium '+
              (tab===value?'bg-secondary text-secondary-foreground':'text-muted-foreground hover:bg-accent')}>
            {value==='media'?(pt?'Mídias':'Media'):(pt?'Arquivos':'Files')}
          </button>)}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {error&&<div role="alert" className="mb-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
            {error}<Button variant="outline" size="sm" className="ml-3" onClick={()=>void loadPage()}>{pt?'Tentar novamente':'Retry'}</Button>
          </div>}
          {tab==='media'?<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map(item=>isVisual(item.attachment.type)
              ?<div key={item.id} className="min-w-0 space-y-1.5">
                <PreviewTile item={item} locale={locale} onOpen={()=>setViewerId(item.id)}/>
                <button type="button" className="flex w-full items-center gap-1 truncate text-left text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={()=>{onClose();onJump(item.id);}}><ArrowUpRight className="size-3 shrink-0"/>{mediaDate(item,locale)}</button>
              </div>
              :<div key={item.id} className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
                <Mic2 className="size-6 text-muted-foreground"/>
                <span className="truncate text-xs font-medium" title={item.attachment.name}>{item.attachment.name}</span>
                <audio src={assetUrl(item)} controls preload="none" className="max-w-full" aria-label={item.attachment.name}/>
                <button type="button" onClick={()=>{onClose();onJump(item.id);}}
                  className="text-left text-[11px] text-muted-foreground hover:text-foreground">{mediaDate(item,locale)}</button>
              </div>)}
          </div>:<div className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {items.map(item=><div key={item.id} className="flex min-w-0 items-center gap-3 p-3 hover:bg-accent/50">
              {item.attachment.type.includes('zip')?<FileArchive className="size-5 shrink-0 text-muted-foreground"/>:
                <FileText className="size-5 shrink-0 text-muted-foreground"/>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={item.attachment.name}>{item.attachment.name}</p>
                <p className="text-xs text-muted-foreground">{mediaDate(item,locale)} · {Math.ceil(item.attachment.size/1024)} KB</p>
              </div>
              <button type="button" className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-secondary"
                aria-label={(pt?'Ir à mensagem de ':'Jump to message for ')+item.attachment.name}
                onClick={()=>{onClose();onJump(item.id);}}><ArrowUpRight className="size-4"/></button>
              <a href={assetUrl(item)} download={item.attachment.name} target="_blank" rel="noopener noreferrer"
                className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-secondary"
                aria-label={(pt?'Baixar ':'Download ')+item.attachment.name}><Download className="size-4"/></a>
            </div>)}
          </div>}
          {loading&&<div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner className="size-4"/>{pt?'Carregando anexos…':'Loading attachments…'}
          </div>}
          {!loading&&!error&&!items.length&&<p className="py-12 text-center text-sm text-muted-foreground">
            {tab==='media'?(pt?'Nenhuma mídia nesta conversa.':'No media in this conversation.'):
              (pt?'Nenhum arquivo nesta conversa.':'No files in this conversation.')}
          </p>}
          {cursor&&!loading&&<div className="mt-5 flex justify-center">
            <Button type="button" variant="outline" onClick={()=>void loadPage(cursor)}>
              {pt?'Carregar mais':'Load more'}
            </Button>
          </div>}
        </div>
      </div>
    </div>
    <ChatMediaViewer items={visualItems} selectedId={viewerId} onSelect={setViewerId}
      onClose={()=>setViewerId(null)} locale={locale}/>
  </>,document.body);
}
