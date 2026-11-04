import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { createPortal } from 'react-dom';
import { Download, FileText, Maximize2, X } from 'lucide-react';
import { ChatAudioPlayer } from './ChatAudioPlayer';
import { useCachedChatMedia } from './chatMediaCache';
import { ZoomableChatImage } from './ZoomableChatImage';
import { attachmentLabel } from './chatAttachmentLabels';

export type CommunityAttachment={id:string;name:string;type:string;size:number};
export function CommunityMessageAttachment({attachment,src,locale}:{attachment:CommunityAttachment;src:string;locale:string}){
  const [expanded,setExpanded]=useState(false);
  const type=attachment.type,pt=locale==='pt-BR';
  const isImage=type.startsWith('image/'),isVideo=type.startsWith('video/'),isAudio=type.startsWith('audio/');
  const cached=useCachedChatMedia(src,isImage||isVideo);
  // Do not fetch the same private image/video twice through both <img>/<video> and the media cache.
  const privateMedia=/^\/media\/(?:dm|community-attachment)\//.test(src);
  const visible=cached || (privateMedia ? null : src);
  const [imageReadySrc,setImageReadySrc]=useState<string|null>(null);
  const [imageFailedSrc,setImageFailedSrc]=useState<string|null>(null);
  const [videoReadySrc,setVideoReadySrc]=useState<string|null>(null);
  const [videoFailedSrc,setVideoFailedSrc]=useState<string|null>(null);
  return <div className="mt-2 min-w-0 max-w-full">
    {isImage?<button type="button" onClick={()=>setExpanded(true)} className="group relative block min-h-32 min-w-36 max-w-full overflow-hidden rounded-xl border border-border"
      aria-label={pt?'Ampliar imagem':'Expand image'}>
      <img src={visible ?? undefined} alt={attachmentLabel(type,locale)} loading="lazy"
        onLoad={()=>setImageReadySrc(visible)} onError={()=>setImageFailedSrc(visible)}
        className="max-h-72 max-w-full object-contain"/>
      {imageReadySrc!==visible&&imageFailedSrc!==visible&&
        <span role="status" aria-label={pt?'Carregando foto':'Loading photo'} className="absolute inset-0 grid place-items-center bg-muted/60">
          <Spinner className="size-5"/>
        </span>}
      {imageReadySrc===visible&&<Maximize2 className="absolute right-2 top-2 size-6 rounded bg-black/60 p-1 text-white opacity-80 group-hover:opacity-100"/>}
    </button>:isVideo?<div className="relative inline-block min-h-32 min-w-36 max-w-full">
      <video src={visible ?? undefined} controls playsInline preload="metadata"
        onLoadedMetadata={()=>setVideoReadySrc(visible)} onError={()=>setVideoFailedSrc(visible)}
        className="max-h-72 max-w-full rounded-xl border border-border"/>
      {videoReadySrc!==visible&&videoFailedSrc!==visible&&
        <span role="status" aria-label={pt?'Carregando vídeo':'Loading video'} className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-muted/60">
          <Spinner className="size-5"/>
        </span>}
    </div>:
      isAudio?<div className="max-w-sm"><ChatAudioPlayer src={src}/></div>:
      <a href={src} download={attachment.name} className="flex max-w-sm items-center gap-2 rounded-xl border border-border bg-secondary/40 p-3 text-sm hover:bg-secondary">
        <FileText className="size-5 shrink-0 text-primary"/><span className="min-w-0 flex-1 truncate" title={attachment.name}>{attachment.name || attachmentLabel(type,locale)}</span><Download className="size-4 shrink-0"/>
      </a>}
    {expanded&&isImage&&typeof document!=='undefined'&&createPortal(
      <div className="fixed inset-0 z-[150] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true"
        aria-label={pt?'Visualizador da imagem':'Image viewer'}>
        <div className="flex h-12 shrink-0 items-center justify-end px-3">
          <a href={src} download={attachment.name} className="grid size-10 place-items-center" aria-label={pt?'Salvar imagem':'Save image'}><Download className="size-5"/></a>
          <button type="button" className="grid size-10 place-items-center" onClick={()=>setExpanded(false)} aria-label={pt?'Fechar':'Close'}><X className="size-6"/></button>
        </div>
        <div className="min-h-0 flex-1"><ZoomableChatImage src={visible} alt={attachmentLabel(type,locale)} locale={locale}/></div>
      </div>,document.body)}
  </div>;
}
