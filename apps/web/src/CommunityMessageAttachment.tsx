import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { createPortal } from 'react-dom';
import { Download, FileText, Maximize2, X } from 'lucide-react';
import { ChatAudioPlayer } from './ChatAudioPlayer';
import { ensureChatMediaCached, useCachedChatMedia } from './chatMediaCache';
import { ZoomableChatImage } from './ZoomableChatImage';
import { attachmentLabel } from './chatAttachmentLabels';

export type CommunityAttachment={id:string;name:string;type:string;size:number};

/** A channel can contain dozens of attachments. Only warm private blobs near
 * the visible scroll region, rather than downloading every video on mount. */
const SMALL_VIDEO_CACHE_BYTES=8*1024*1024;
export function CommunityMessageAttachment({attachment,src,locale}:{attachment:CommunityAttachment;src:string;locale:string}){
  const [expanded,setExpanded]=useState(false);
  const containerRef=useRef<HTMLDivElement>(null);
  const [nearViewport,setNearViewport]=useState(false);
  const type=attachment.type,pt=locale==='pt-BR';
  const isImage=type.startsWith('image/'),isVideo=type.startsWith('video/'),isAudio=type.startsWith('audio/');
  const privateMedia=/^\/media\/(?:dm|community-attachment)\//.test(src);
  useEffect(()=>{
    setNearViewport(false);
    if(!isImage&&!isVideo)return;
    const node=containerRef.current;
    if(!node||typeof IntersectionObserver==='undefined'){
      setNearViewport(true);
      return;
    }
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){
        setNearViewport(true);
        observer.disconnect();
      }
    },{rootMargin:'360px 0px'});
    observer.observe(node);
    return()=>observer.disconnect();
  },[src,isImage,isVideo]);
  // Cache images and small clips in RAM, reuse the same blob URL after channel
  // changes, but do not fully download large videos just to show metadata.
  const cacheable=isImage||(isVideo&&attachment.size<=SMALL_VIDEO_CACHE_BYTES);
  const cached=useCachedChatMedia(src,nearViewport&&cacheable);
  const visible=cached||(!privateMedia?src:null);
  const videoSrc=visible||(isVideo&&nearViewport&&!cacheable?src:null);
  const [imageReadySrc,setImageReadySrc]=useState<string|null>(null);
  const [imageFailedSrc,setImageFailedSrc]=useState<string|null>(null);
  const [videoReadySrc,setVideoReadySrc]=useState<string|null>(null);
  const [videoFailedSrc,setVideoFailedSrc]=useState<string|null>(null);
  const imageLoading=nearViewport&&(!visible||(imageReadySrc!==visible&&imageFailedSrc!==visible));
  const videoLoading=nearViewport&&(!videoSrc||(videoReadySrc!==videoSrc&&videoFailedSrc!==videoSrc));
  return <div ref={containerRef} className="mt-2 min-w-0 max-w-full overflow-hidden">
    {isImage?<button type="button" onClick={()=>setExpanded(true)}
      className="group relative block w-fit min-w-0 max-w-full overflow-hidden rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={pt?'Ampliar imagem':'Expand image'}>
      {visible?<img src={visible} alt={attachmentLabel(type,locale)} loading="lazy" decoding="async"
        onLoad={()=>setImageReadySrc(visible)} onError={()=>setImageFailedSrc(visible)}
        className="block h-auto max-h-72 w-auto max-w-full object-contain"/>:
        <span className="block aspect-[4/3] w-44 max-w-full bg-muted/30"/>}
      {imageLoading&&<span role="status" aria-label={pt?'Carregando foto':'Loading photo'}
        className="absolute inset-0 grid place-items-center bg-muted/60">
        <Spinner className="size-5"/>
      </span>}
      {imageFailedSrc===visible&&visible&&<span className="absolute inset-0 grid place-items-center bg-muted p-2 text-xs text-foreground">
        {pt?'Imagem indisponível':'Image unavailable'}
      </span>}
      {imageReadySrc===visible&&visible&&<Maximize2 className="absolute right-2 top-2 size-6 rounded bg-black/60 p-1 text-white opacity-80 group-hover:opacity-100"/>}
    </button>:isVideo?<div className="relative block aspect-video w-[min(280px,100%)] min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-black">
      <video src={videoSrc??undefined} controls playsInline preload={nearViewport?'metadata':'none'}
        onLoadedMetadata={()=>setVideoReadySrc(videoSrc)}
        onError={()=>setVideoFailedSrc(videoSrc)}
        className="block h-full max-h-72 w-full min-w-0 object-contain"/>
      {videoLoading&&<span role="status" aria-label={pt?'Carregando vídeo':'Loading video'}
        className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30">
        <Spinner className="size-5 text-white"/>
      </span>}
      {videoFailedSrc===videoSrc&&videoSrc&&<span className="pointer-events-none absolute inset-0 grid place-items-center p-2 text-xs text-white">
        {pt?'Vídeo indisponível':'Video unavailable'}
      </span>}
    </div>:
      isAudio?<div className="min-w-0 max-w-full"><ChatAudioPlayer src={src}/></div>:
      <a href={cached||src} download={attachment.name}
        onMouseEnter={()=>{if(attachment.size<=SMALL_VIDEO_CACHE_BYTES)void ensureChatMediaCached(src);}}
        onFocus={()=>{if(attachment.size<=SMALL_VIDEO_CACHE_BYTES)void ensureChatMediaCached(src);}}
        className="flex min-w-0 max-w-sm items-center gap-2 rounded-xl border border-border bg-secondary/40 p-3 text-sm hover:bg-secondary">
        <FileText className="size-5 shrink-0 text-primary"/>
        <span className="min-w-0 flex-1 truncate" title={attachment.name}>{attachment.name || attachmentLabel(type,locale)}</span>
        <Download className="size-4 shrink-0"/>
      </a>}
    {expanded&&isImage&&typeof document!=='undefined'&&createPortal(
      <div className="fixed inset-0 z-[150] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true"
        aria-label={pt?'Visualizador da imagem':'Image viewer'}>
        <div className="flex h-12 shrink-0 items-center justify-end px-3">
          <a href={cached||src} download={attachment.name} className="grid size-10 place-items-center" aria-label={pt?'Salvar imagem':'Save image'}><Download className="size-5"/></a>
          <button type="button" className="grid size-10 place-items-center" onClick={()=>setExpanded(false)} aria-label={pt?'Fechar':'Close'}><X className="size-6"/></button>
        </div>
        <div className="min-h-0 flex-1"><ZoomableChatImage src={visible||src} alt={attachmentLabel(type,locale)} locale={locale}/></div>
      </div>,document.body)}
  </div>;
}
