import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useDragControls, useMotionValue, useTransform } from 'motion/react';
import { createPortal } from 'react-dom';
import { Copy, Download, FileText, Forward, LoaderCircle, MapPin, Newspaper, MoreHorizontal, Pencil, Play, Reply, Trash2, X } from 'lucide-react';
import { ChatAudioPlayer } from './ChatAudioPlayer';
import { attachmentLabel } from './chatAttachmentLabels';
import { useCachedChatMedia } from './chatMediaCache';
import { cn } from '@/lib/utils';

export type DirectChatMessage = {
  id: string; conversationId: string; authorId: string; body: string;
  clientId: string | null; createdAt: string; readAt: string | null;
  deliveredAt: string | null; editedAt: string | null; deletedAt: string | null; forwarded: boolean;
  pendingStatus?: 'sending' | 'failed'; statusUpdatedAt?: string;
  replyToId?: string | null;
  replyTo?: { id: string; body: string; authorId: string; deleted: boolean } | null;
  reactions: { emoji: string; count: number }[]; myReaction: string | null;
  attachment?: { id: string; name: string; type: string; size: number } | null;
  attachmentUrl?: string;
};

function SwipeToReply({ children, onReply }: { children: ReactNode; onReply: () => void }) {
  const controls = useDragControls();
  const x = useMotionValue(0);
  const visible = useTransform(x, [12, 55], [0, 1]);
  const dragged = useRef(false);
  return <div className="relative min-w-0">
    <motion.span aria-hidden="true" style={{ opacity: visible }}
      className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-primary">
      <Reply className="size-5"/>
    </motion.span>
    <motion.div drag="x" dragControls={controls} dragListener={false}
      dragConstraints={{ left: 0, right: 72 }} dragElastic={0.04} dragMomentum={false}
      dragSnapToOrigin style={{ x, touchAction: 'pan-y' }}
      onPointerDown={event => {
        dragged.current = false;
        if (event.pointerType === 'mouse') return;
        const element = event.target as HTMLElement;
        if (element.closest('button, a, input, textarea, audio, video, [role="slider"]')) return;
        controls.start(event);
      }}
      onClickCapture={event => {
        if (dragged.current) { event.preventDefault(); event.stopPropagation(); dragged.current = false; }
      }}
      onDragEnd={(_event, info) => {
        dragged.current = Math.abs(info.offset.x) > 8;
        if (info.offset.x > 56) onReply();
      }}>
      {children}
    </motion.div>
  </div>;
}

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;

export function DirectMessageBubble({ message, mine, locale, myId, peerName, onReply, onJumpToReply, onEdit, onCancel, onReact, onForward, onRetry, onOpenMedia, disabled, highlighted }: {
  message: DirectChatMessage; mine: boolean; locale: string; myId: string; peerName: string;
  onReply: (message: DirectChatMessage) => void;
  onJumpToReply: (messageId: string) => void;
  onEdit: (message: DirectChatMessage) => void;
  onCancel: (message: DirectChatMessage) => void;
  onForward: (message: DirectChatMessage) => void;
  onReact: (message: DirectChatMessage, emoji: string | null) => void;
  onRetry: (message: DirectChatMessage) => void;
  onOpenMedia?: (messageId:string)=>void;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  const pt = locale === 'pt-BR';
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [conversationBounds, setConversationBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const asset = message.attachment;
  const assetUrl = asset && (message.attachmentUrl || '/media/dm/' + message.conversationId + '/' + asset.id);
  const isImage = !!asset?.type.startsWith('image/');
  const isVideo = !!asset?.type.startsWith('video/');
  const isAudio = !!asset?.type.startsWith('audio/');
  const imageRef=useRef<HTMLButtonElement>(null);
  const [imageNearViewport,setImageNearViewport]=useState(false);
  useEffect(()=>{
    if(!isImage){setImageNearViewport(false);return;}
    const node=imageRef.current;
    if(!node || typeof IntersectionObserver==='undefined'){setImageNearViewport(true);return;}
    const observer=new IntersectionObserver(records=>{
      if(records.some(entry=>entry.isIntersecting)){
        setImageNearViewport(true);observer.disconnect();
      }
    },{rootMargin:'300px'});
    observer.observe(node);
    return()=>observer.disconnect();
  },[isImage,assetUrl]);
  const cachedSrc=useCachedChatMedia(assetUrl,isImage && imageNearViewport);
  const visibleSrc=cachedSrc || assetUrl || undefined;
  const mediaLabel=attachmentLabel(asset?.type,locale);
  const time = new Date(message.createdAt);
  const quote = /^> ([^\n]+)\n\n([\s\S]*)$/.exec(message.body);
  // Old OpenStreetMap shares remain readable, but now always open Google Maps.
  const locationMessage=/^📍 (?:Localização compartilhada|Shared location)\nhttps:\/\/(?:www\.openstreetmap\.org\/\?mlat=([-\d.]+)&mlon=([-\d.]+)#map=[-\d./]+|www\.google\.com\/maps\?q=([-\d.]+),([-\d.]+))(?:\n([\s\S]*))?$/.exec(message.body);
  const latitude=Number(locationMessage?.[1]??locationMessage?.[3]);
  const longitude=Number(locationMessage?.[2]??locationMessage?.[4]);
  const mapHref=locationMessage && Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude)<=90 && Math.abs(longitude)<=180
    ? 'https://www.google.com/maps?q='+latitude+','+longitude : null;
  const sharedPostId=(()=>{
    try{
      const target=new URL(message.body.trim());
      const id=target.searchParams.get('post');
      return target.origin===window.location.origin && target.pathname==='/' &&
        id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
    }catch{return null;}
  })();
  const timeLabel = Number.isFinite(time.getTime())
    ? time.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const node = trigger.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const vp = window.visualViewport;
      const leftEdge = vp?.offsetLeft ?? 0, topEdge = vp?.offsetTop ?? 0;
      const viewportWidth = vp?.width ?? window.innerWidth;
      const viewportHeight = vp?.height ?? window.innerHeight;
      const width = Math.min(264, viewportWidth - 16);
      const height = menu.current?.offsetHeight ?? 105;
      const preferredLeft = mine ? rect.right - width : rect.left;
      const left = Math.min(Math.max(preferredLeft, leftEdge + 8), leftEdge + viewportWidth - width - 8);
      const top = rect.bottom + height + 8 < topEdge + viewportHeight
        ? rect.bottom + 6 : rect.top - height - 6;
      setPosition({ left, top: Math.min(Math.max(topEdge + 8, top), topEdge + viewportHeight - height - 8), width });
      const room = node.closest('section[data-chat-conversation]')?.getBoundingClientRect();
      setConversationBounds(room
        ? { left: room.left, top: room.top, width: room.width, height: room.height }
        : { left: leftEdge, top: topEdge, width: viewportWidth, height: viewportHeight });
    }
    place();
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (trigger.current?.contains(event.target as Node) || menu.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [open, mine]);

  async function copyText() {
    try { await navigator.clipboard.writeText(message.body); } catch { /* leave text selectable */ }
    setOpen(false);
  }

  return <div data-direct-message-id={message.id} className={cn('group relative flex min-w-0 items-start gap-1.5', mine ? 'justify-end' : 'justify-start')}>
    <SwipeToReply onReply={() => { if (!message.deletedAt && !message.pendingStatus) onReply(message); }}>
      <div className={cn('min-w-0 max-w-[calc(100vw-108px)] rounded-[5px] px-3.5 py-2.5 text-sm leading-6 sm:max-w-[min(72vw,720px)]', highlighted && 'outline outline-2 outline-primary outline-offset-2',
        mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
        {message.forwarded && !message.deletedAt && <span className="mb-1 flex items-center gap-1 text-[11px] opacity-75"><Forward className="size-3"/> {pt ? 'Encaminhada' : 'Forwarded'}</span>}
        {message.replyTo && !message.deletedAt && <button type="button"
          onClick={() => onJumpToReply(message.replyTo!.id)}
          aria-label={pt ? 'Ir para a mensagem respondida' : 'Jump to replied message'}
          className={cn('mb-2 block w-full rounded-sm border-l-2 px-2 py-1 text-left text-xs transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-current',mine?'border-white/60 bg-white/10':'border-primary/70 bg-background/60')}>
          <span className="block font-semibold">{pt ? 'Resposta a ' : 'Reply to '}{message.replyTo.authorId === myId ? (pt ? 'você' : 'you') : peerName}</span>
          <span className="mt-0.5 block max-w-full truncate opacity-80">
            {message.replyTo.deleted ? (pt ? 'Mensagem excluída' : 'Deleted message') : message.replyTo.body}
          </span>
        </button>}
        {quote && !message.replyToId && !message.deletedAt && <blockquote className={cn('mb-2 border-l-2 px-2 py-1 text-xs',mine?'border-white/60 bg-white/10':'border-primary/70 bg-background/60')}>
          <span className="block font-semibold">{pt ? 'Resposta antiga' : 'Legacy reply'}</span>
          <span className="mt-0.5 block max-w-full truncate opacity-80">{quote[1]}</span>
        </blockquote>}

        {asset && assetUrl && !message.deletedAt && <div className="mb-1 min-w-0">
          {isImage ? <button ref={imageRef} type="button" onClick={() => onOpenMedia ? onOpenMedia(message.id) : setPreviewOpen(true)}
            aria-label={pt ? 'Ampliar imagem' : 'Open image'}
            className="block max-w-full focus-visible:outline-2 focus-visible:outline-current">
            {cachedSrc || !assetUrl.startsWith('/media/dm/')
              ? <img src={visibleSrc} alt={mediaLabel} loading="lazy" decoding="async"
                className="max-h-[360px] w-auto max-w-full object-contain" />
              : <span role="status" aria-label={pt?'Carregando foto':'Loading photo'}
                className="block h-36 w-44 animate-pulse bg-muted" />}
          </button> : isVideo ? <button type="button" onClick={() => onOpenMedia?.(message.id)}
              aria-label={pt?'Abrir vídeo':'Open video'}
              className="relative block max-w-full bg-black focus-visible:outline-2 focus-visible:outline-current">
              <video src={visibleSrc} muted playsInline preload="metadata" className="pointer-events-none max-h-[320px] max-w-full"/>
              <span className="absolute inset-0 grid place-items-center bg-black/20"><Play className="size-10 text-white" fill="currentColor"/></span>
            </button> : isAudio ? <ChatAudioPlayer src={assetUrl}/> :
            <a href={assetUrl} download={asset.name}
              className="flex min-w-0 items-center gap-2 border border-current/20 px-2 py-2 hover:underline">
              <FileText className="size-5 shrink-0"/><span className="min-w-0 flex-1 truncate text-xs">{mediaLabel}</span>
              <Download className="size-4 shrink-0"/>
            </a>}
        </div>}
        {mapHref && !message.deletedAt && <a href={mapHref} target="_blank" rel="noopener noreferrer"
          className="mb-2 flex items-center gap-2 border border-current/25 bg-current/5 px-3 py-3 hover:underline"
          aria-label={pt?'Abrir localização no mapa':'Open location on map'}>
          <MapPin className="size-6 shrink-0"/>
          <span className="text-xs font-semibold">{pt?'Localização compartilhada · Ver no mapa':'Shared location · View map'}</span>
        </a>}
        {sharedPostId&&!message.deletedAt&&<a href={'/?post='+sharedPostId}
          onClick={event=>{
            event.preventDefault();
            window.dispatchEvent(new CustomEvent('uorqui:open-feed-post',{detail:sharedPostId}));
          }} className="mb-1 flex min-h-12 items-center gap-2 rounded-[5px] border border-current/20 bg-current/5 px-3 text-sm font-medium hover:underline"
          aria-label={pt?'Ver publicação compartilhada no feed':'View shared post in feed'}>
          <Newspaper className="size-4 shrink-0"/>{pt?'Ver publicação no feed':'View post in feed'}
        </a>}
        <p className="whitespace-pre-wrap break-words">
          {message.deletedAt
            ? <span className="italic opacity-70">{pt ? 'Mensagem excluída' : 'Deleted message'}</span>
            : (locationMessage ? (locationMessage[5]??'') : quote && !message.replyToId ? quote[2] : message.body)}
          {' '}
          <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap align-baseline text-[10px] opacity-80', mine ? 'text-primary-foreground' : 'text-muted-foreground')}>
            {message.editedAt && !message.deletedAt && <span>{pt ? 'editada' : 'edited'}</span>}
            <time dateTime={message.createdAt}>{timeLabel}</time>
            {mine && !message.deletedAt && (
              message.pendingStatus === 'sending' ? <LoaderCircle aria-label={pt ? 'Enviando' : 'Sending'} className="size-3 animate-spin"/>
              : message.pendingStatus === 'failed' ? <button type="button" onClick={() => onRetry(message)}
                  className="rounded border border-current px-1 font-semibold underline" aria-label={pt ? 'Falha ao enviar. Tentar novamente' : 'Failed to send. Retry'}>{pt ? 'Reenviar' : 'Retry'}</button>
              : null
            )}
          </span>
        </p>
      </div>
      {!!message.reactions?.length && !message.deletedAt && <div className={cn('mt-1 flex flex-wrap gap-1', mine ? 'justify-end' : 'justify-start')}>
        {message.reactions.map(reaction => <button key={reaction.emoji} type="button"
          disabled={disabled || mine}
          aria-label={(pt ? 'Reação' : 'Reaction') + ' ' + reaction.emoji + ': ' + reaction.count}
          aria-pressed={message.myReaction === reaction.emoji}
          onClick={() => onReact(message, message.myReaction === reaction.emoji ? null : reaction.emoji)}
          className={cn('inline-flex min-h-7 items-center gap-1 rounded-sm border border-border bg-card px-2 text-xs', message.myReaction === reaction.emoji && 'border-primary bg-primary/10', !mine && 'hover:bg-accent')}>
          <span>{reaction.emoji}</span><span>{reaction.count}</span>
        </button>)}
      </div>}
    </SwipeToReply>
    {!message.deletedAt && !message.pendingStatus && <button ref={trigger} type="button" onClick={() => { setPosition(null); setOpen(v => !v); }}
      aria-label={pt ? 'Opções da mensagem' : 'Message options'} aria-haspopup="menu" aria-expanded={open}
      disabled={disabled}
      className={cn('grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-opacity hover:bg-accent focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100',mine && 'order-first')}>
      <MoreHorizontal className="size-[18px]"/>
    </button>}
    {previewOpen && isImage && assetUrl && typeof document !== 'undefined' && createPortal(
      <div role="dialog" aria-modal="true" aria-label={mediaLabel}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4"
        onKeyDown={e => { if(e.key === 'Escape') setPreviewOpen(false); }}>
        <button type="button" onClick={() => setPreviewOpen(false)}
          aria-label={pt ? 'Fechar imagem' : 'Close image'}
          className="absolute right-4 top-4 grid size-11 place-items-center text-white"><X className="size-6"/></button>
        <img src={visibleSrc} alt={mediaLabel} className="max-h-[85dvh] max-w-[95vw] object-contain"/>
        <a href={assetUrl} download={asset?.name} className="mt-3 flex items-center gap-2 text-sm text-white underline">
          <Download className="size-4"/>{pt ? 'Salvar imagem' : 'Save image'}</a>
      </div>,document.body)}
    {open && !message.deletedAt && typeof document !== 'undefined' && createPortal(<>
      <div aria-hidden="true" className="fixed z-[90] bg-background/15 backdrop-blur-[4px]" style={conversationBounds ?? { inset: 0 }} onClick={() => setOpen(false)}/>
      <div ref={menu} role="menu" aria-label={pt ? 'Ações da mensagem' : 'Message actions'}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); trigger.current?.focus(); } }}
        className="fixed z-[91] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-2xl"
        style={{ left: position?.left ?? -9999, top: position?.top ?? -9999, width: position?.width ?? 264, visibility: position ? 'visible' : 'hidden' }}>
        {!mine && <div className="border-b border-border px-2 pb-2">
          <p className="px-1 py-1 text-[11px] text-muted-foreground">{pt ? 'Reagir à mensagem' : 'React to message'}</p>
          <div className="flex justify-between gap-0.5">
            {REACTIONS.map(emoji => <button key={emoji} type="button"
              aria-label={(pt ? 'Reagir' : 'React') + ' ' + emoji} aria-pressed={message.myReaction === emoji}
              onClick={() => { setOpen(false); onReact(message, message.myReaction === emoji ? null : emoji); }}
              className={cn('grid size-9 place-items-center text-lg hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring', message.myReaction === emoji && 'bg-primary/20')}>{emoji}</button>)}
          </div>
        </div>}
        <button role="menuitem" type="button" onClick={() => { setOpen(false); onReply(message); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-accent"><Reply className="size-4"/>{pt ? 'Responder' : 'Reply'}</button>
        {!!message.body && <button role="menuitem" type="button" onClick={() => void copyText()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-accent"><Copy className="size-4"/>{pt ? 'Copiar' : 'Copy'}</button>}
        <button role="menuitem" type="button" onClick={() => { setOpen(false); onForward(message); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-accent"><Forward className="size-4"/>{pt ? 'Compartilhar / Encaminhar' : 'Share / Forward'}</button>
        {mine && !asset && <button role="menuitem" type="button" onClick={() => { setOpen(false); onEdit(message); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-accent"><Pencil className="size-4"/>{pt ? 'Editar' : 'Edit'}</button>}
        {mine && !message.readAt && <button role="menuitem" type="button" onClick={() => { setOpen(false); onCancel(message); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-destructive hover:bg-accent"><Trash2 className="size-4"/>{pt ? 'Cancelar mensagem' : 'Cancel message'}</button>}
        <button role="menuitem" type="button" onClick={() => setOpen(false)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-accent"><X className="size-4"/>{pt ? 'Fechar' : 'Close'}</button>
      </div>
    </>, document.body)}
  </div>;
}
