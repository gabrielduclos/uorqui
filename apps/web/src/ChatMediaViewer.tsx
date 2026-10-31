import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Pencil, X } from 'lucide-react';
import { ChatImageEditor } from './ChatImageEditor';
import { attachmentLabel } from './chatAttachmentLabels';
import { useCachedChatMedia } from './chatMediaCache';
import { createPortal } from 'react-dom';
import type { DirectChatMessage } from './DirectMessageBubble';

type MediaMessage = DirectChatMessage & { attachment: NonNullable<DirectChatMessage['attachment']> };

export function ChatMediaViewer({ items, selectedId, onSelect, onClose, onSendEdited, locale }: {
  items: MediaMessage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onSendEdited?: (file: File) => void;
  locale: string;
}) {
  const closeRef=useRef<HTMLButtonElement>(null);
  const [editing,setEditing]=useState(false);
  useEffect(()=>setEditing(false),[selectedId]);
  const index=items.findIndex(item=>item.id===selectedId);
  const active=items[index];
  const pt=locale==='pt-BR';
  useEffect(()=>{
    if(!selectedId)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    closeRef.current?.focus();
    return()=>previous?.focus();
  },[selectedId]);
  useEffect(()=>{
    if(!selectedId)return;
    function handle(event:KeyboardEvent) {
      if(event.key==='Escape'){event.preventDefault();if(editing)setEditing(false);else onClose();}
      if(!editing && event.key==='ArrowLeft' && index>0){event.preventDefault();onSelect(items[index-1].id);}
      if(!editing && event.key==='ArrowRight' && index<items.length-1){event.preventDefault();onSelect(items[index+1].id);}
      if(event.key==='Tab'){
        const dialog=document.getElementById('uorqui-chat-media-viewer');
        const nodes=dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], video[controls]');
        if(!nodes?.length)return;
        if(event.shiftKey && document.activeElement===nodes[0]){event.preventDefault();nodes[nodes.length-1].focus();}
        else if(!event.shiftKey && document.activeElement===nodes[nodes.length-1]){event.preventDefault();nodes[0].focus();}
      }
    }
    window.addEventListener('keydown',handle);
    return()=>window.removeEventListener('keydown',handle);
  },[selectedId,index,items,onSelect,onClose,editing]);
  if(!active || !selectedId || typeof document==='undefined')return null;
  const image=active.attachment.type.startsWith('image/');
  const url=active.attachmentUrl || '/media/dm/'+active.conversationId+'/'+active.attachment.id;
  const cached=useCachedChatMedia(url,!!selectedId);
  const [videoPlaying,setVideoPlaying]=useState(false);
  const [videoSrc,setVideoSrc]=useState(url);
  useEffect(()=>{setVideoPlaying(false);setVideoSrc(url);},[url]);
  useEffect(()=>{if(cached && !videoPlaying)setVideoSrc(cached);},[cached,videoPlaying]);
  const displayedName=attachmentLabel(active.attachment.type,locale);
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 p-3 text-white sm:p-6"
      onMouseDown={e=>{if(e.currentTarget===e.target)onClose();}}>
      <div id="uorqui-chat-media-viewer" role="dialog" aria-modal="true"
        aria-label={pt?'Visualizador de mídias':'Media viewer'} className="flex h-full max-h-[94dvh] w-full max-w-6xl flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-white/15 pb-3">
          <p className="min-w-0 flex-1 truncate text-sm">{displayedName}</p>
          <span className="shrink-0 text-xs text-white/70">{index+1} / {items.length}</span>
          {image && onSendEdited && !editing && !active.pendingStatus && <button type="button"
            onClick={()=>setEditing(true)} className="flex min-h-10 items-center gap-1 border border-white/20 px-2 text-xs hover:bg-white/15"
            aria-label={pt?'Editar e reenviar foto':'Edit and resend image'}>
            <Pencil className="size-4"/><span className="hidden sm:inline">{pt?'Editar foto':'Edit photo'}</span>
          </button>}
          <a href={url} download={active.attachment.name} className="grid size-10 place-items-center hover:bg-white/15"
            aria-label={pt?'Salvar mídia':'Download media'}><Download className="size-5"/></a>
          <button ref={closeRef} type="button" onClick={onClose}
            className="grid size-10 place-items-center hover:bg-white/15"
            aria-label={pt?'Fechar visualizador':'Close viewer'}><X className="size-5"/></button>
        </div>
        {editing && image && onSendEdited ? <ChatImageEditor key={url} src={url}
          onCancel={()=>setEditing(false)}
          onSave={blob=>{onSendEdited(new File([blob],active.attachment.name.replace(/\.[^.]+$/,'')+'-editada.png',{type:'image/png'}));setEditing(false);onClose();}}/> :
        <div className="flex min-h-0 flex-1 items-center justify-between gap-1 py-4 sm:gap-4">
          <button type="button" onClick={()=>{if(index>0)onSelect(items[index-1].id);}} disabled={index<=0}
            className="grid size-10 shrink-0 place-items-center disabled:opacity-25"
            aria-label={pt?'Mídia anterior':'Previous media'}><ChevronLeft className="size-6"/></button>
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
            {image?<img key={active.id} src={cached || url} alt={displayedName}
              className="max-h-[76dvh] max-w-full object-contain"/>:
              <video key={active.id} src={videoSrc} controls playsInline preload="metadata"
                onPlay={()=>setVideoPlaying(true)} onPause={()=>setVideoPlaying(false)}
                className="max-h-[76dvh] max-w-full" aria-label={displayedName}/>}
          </div>
          <button type="button" onClick={()=>{if(index<items.length-1)onSelect(items[index+1].id);}} disabled={index>=items.length-1}
            className="grid size-10 shrink-0 place-items-center disabled:opacity-25"
            aria-label={pt?'Próxima mídia':'Next media'}><ChevronRight className="size-6"/></button>
        </div>}
        <p className="hidden text-center text-xs text-white/60 sm:block">
          {pt?'Use ← → para navegar · Esc para fechar':'Use ← → to navigate · Esc to close'}
        </p>
      </div>
    </div>, document.body);
}
