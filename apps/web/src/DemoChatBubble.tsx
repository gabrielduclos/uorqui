import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, useDragControls, useMotionValue, useTransform } from 'motion/react';
import { Copy, MapPin, MoreHorizontal, Pencil, Reply, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DemoAttachmentView, type DemoAttachment, type DemoLocation } from './DemoMessageComposer';

/** Local preview data only. Production messaging will use its own API-backed message model. */
export type DemoMessage = {
  id: number;
  mine: boolean;
  text: string;
  time: string;
  attachment?: DemoAttachment;
  location?: DemoLocation;
  replyTo?: number;
  edited?: boolean;
  myReaction?: string;
};

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;

export function messagePreview(message: DemoMessage): string {
  if (message.text.trim()) return message.text.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (message.location) return 'Localização';
  switch (message.attachment?.kind) {
    case 'image': return 'Foto';
    case 'video': return 'Vídeo';
    case 'audio': return 'Áudio';
    case 'file': return message.attachment.name;
    default: return 'Mensagem';
  }
}

function SwipeToReply({ children, onReply }: { children: ReactNode; onReply: () => void }) {
  const controls = useDragControls();
  const x = useMotionValue(0);
  const fade = useTransform(x, [12, 55], [0, 1]);
  const isDrag = useRef(false);

  return <div className="relative min-w-0">
    <motion.span aria-hidden="true" style={{ opacity: fade }} className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-primary">
      <Reply className="size-5" />
    </motion.span>
    <motion.div
      drag="x"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ left: 0, right: 72 }}
      dragElastic={0.04}
      dragMomentum={false}
      dragSnapToOrigin
      style={{ x, touchAction: 'pan-y' }}
      onPointerDown={event => {
        isDrag.current = false;
        if (event.pointerType === 'mouse') return;
        const element = event.target as HTMLElement;
        if (element.closest('button, a, input, textarea, audio, video, [role="slider"]')) return;
        controls.start(event);
      }}
      onClickCapture={event => {
        if (isDrag.current) { event.preventDefault(); event.stopPropagation(); isDrag.current = false; }
      }}
      onDragEnd={(_event, info) => {
        isDrag.current = Math.abs(info.offset.x) > 8;
        if (info.offset.x > 56) onReply();
      }}
    >{children}</motion.div>
  </div>;
}

export function DemoLocationCard({ location }: { location: DemoLocation }) {
  const latitude = location.latitude.toFixed(6);
  const longitude = location.longitude.toFixed(6);
  const mapUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(latitude + ',' + longitude);
  return <a href={mapUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir localização compartilhada no mapa" className="mt-1 flex min-w-[190px] max-w-sm items-center gap-3 border border-current/20 bg-black/10 p-3 hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-ring">
    <span className="grid size-10 shrink-0 place-items-center bg-current/10"><MapPin className="size-5" /></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Localização</span><span className="block text-xs opacity-75">Abrir no mapa</span></span>
  </a>;
}

export function DemoChatBubble({ message, quoted, onReply, onEdit, onDelete, onLocateReply, onReact, onOpenMedia }: {
  message: DemoMessage;
  quoted?: DemoMessage;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLocateReply: (id: number) => void;
  onReact?: (emoji: string) => void;
  onOpenMedia?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [conversationBounds, setConversationBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const triggerBounds = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0;
      const y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const menuWidth = Math.min(264, Math.max(160, width - 16));
      const menuHeight = Math.min(menuRef.current?.offsetHeight ?? 240, Math.max(1, height - 16));
      const leftPreferred = message.mine ? triggerBounds.right - menuWidth : triggerBounds.left;
      const left = Math.max(x + 8, Math.min(leftPreferred, x + width - menuWidth - 8));
      const roomBelow = y + height - triggerBounds.bottom - 8;
      const roomAbove = triggerBounds.top - y - 8;
      const topPreferred = roomBelow >= menuHeight || roomBelow >= roomAbove
        ? triggerBounds.bottom + 6
        : triggerBounds.top - menuHeight - 6;
      const top = Math.max(y + 8, Math.min(topPreferred, y + height - menuHeight - 8));
      setMenuPosition({ left, top, width: menuWidth });

      const conversation = trigger.closest('section[aria-label="Conversa demonstrativa"]');
      const bounds = conversation?.getBoundingClientRect();
      setConversationBounds(bounds
        ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }
        : { left: x, top: y, width, height });
    };

    updatePosition();
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();

    const dismiss = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node) || triggerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    document.addEventListener('pointerdown', dismiss, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
      document.removeEventListener('pointerdown', dismiss, true);
    };
  }, [open, message.mine]);

  async function copy() {
    if (!message.text.trim()) return;
    try {
      await navigator.clipboard.writeText(message.text);
      setFeedback('Mensagem copiada');
    } catch {
      setFeedback('Não foi possível copiar');
    }
    setOpen(false);
  }

  return <div id={'dm-message-' + message.id} className={cn('group relative flex w-full min-w-0 items-start gap-2', message.mine ? 'justify-end' : 'justify-start')}>
    <SwipeToReply onReply={onReply}>
      <div className={cn('min-w-0 max-w-[calc(100vw-108px)] rounded-none px-3.5 py-2.5 text-sm sm:max-w-[min(72vw,720px)]', message.mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
        {typeof message.replyTo === 'number' && <button type="button" onClick={() => onLocateReply(message.replyTo!)} className={cn('mb-2 block w-full border-l-2 px-2 py-1 text-left text-xs focus-visible:outline-2 focus-visible:outline-ring', message.mine ? 'border-white/60 bg-white/10' : 'border-primary/70 bg-background/60')} aria-label="Ir para mensagem respondida">
          <span className="block font-semibold">{quoted ? quoted.mine ? 'Você' : 'Contato' : 'Mensagem anterior'}</span>
          <span className="mt-0.5 block max-w-full truncate opacity-80">{quoted ? messagePreview(quoted) : 'Mensagem indisponível'}</span>
        </button>}
        {message.text && <p className="wrap-break-word whitespace-pre-wrap leading-6">{message.text}</p>}
        {message.attachment && <DemoAttachmentView attachment={message.attachment} onOpenMedia={onOpenMedia} />}
        {message.location && <DemoLocationCard location={message.location} />}
        <div className={cn('mt-1 flex items-center justify-end gap-1 text-[11px]', message.mine ? 'text-white/75' : 'text-muted-foreground')}>
          {message.edited && <span>editada ·</span>}
          <time>{message.time}</time>
        </div>
        {message.myReaction && !message.mine && <button type="button" onClick={() => onReact?.(message.myReaction!)} aria-label={'Remover reação ' + message.myReaction} title="Remover minha reação" className="mt-2 inline-flex items-center border border-border/50 bg-background/80 px-2 py-0.5 text-sm text-foreground hover:bg-accent">
          {message.myReaction}<span className="ml-1 text-[10px] opacity-70">1</span>
        </button>}
      </div>
    </SwipeToReply>
    <div className={cn('relative flex shrink-0 items-start', message.mine && 'order-first')}>
      <Button ref={triggerRef} type="button" variant="ghost" size="icon-sm" aria-label="Opções da mensagem" title="Opções da mensagem" aria-expanded={open} aria-haspopup="menu" onClick={() => { setMenuPosition(null); setOpen(value => !value); }} className="mt-1 size-8 text-muted-foreground opacity-80 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
        <MoreHorizontal className="size-4" />
      </Button>
      {open && typeof document !== 'undefined' && createPortal(<>
        <div aria-hidden="true" className="fixed z-[80] bg-background/15 backdrop-blur-[4px]" style={conversationBounds ?? { inset: 0 }} onClick={() => setOpen(false)} />
        <div ref={menuRef} role="menu" aria-label="Ações da mensagem" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); } }} style={{ left: menuPosition?.left ?? -9999, top: menuPosition?.top ?? -9999, width: menuPosition?.width ?? 264, visibility: menuPosition ? 'visible' : 'hidden' }}
          className="fixed z-[81] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-2xl">
        <button type="button" role="menuitem" onClick={() => { setOpen(false); onReply(); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><Reply className="size-4" />Responder</button>
        {!message.mine && onReact && <div className="border-b border-border px-1.5 pb-1.5">
          <p className="px-1.5 py-1 text-[11px] text-muted-foreground">Reagir à mensagem</p>
          <div className="flex items-center gap-0.5">
            {QUICK_REACTIONS.map(emoji => <button key={emoji} type="button" aria-label={'Reagir com ' + emoji} aria-pressed={message.myReaction === emoji} onClick={() => { onReact(emoji); setOpen(false); }} className={cn('grid size-9 place-items-center text-lg hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring', message.myReaction === emoji && 'bg-primary/15')}>
              {emoji}
            </button>)}
          </div>
        </div>}
        {message.text.trim() && <button type="button" role="menuitem" onClick={() => void copy()} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><Copy className="size-4" />Copiar texto</button>}
        {message.mine && !!message.text && !message.attachment && <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><Pencil className="size-4" />Editar</button>}
        {message.mine && <button type="button" role="menuitem" onClick={() => { setOpen(false); onDelete(); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-destructive hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><Trash2 className="size-4" />Excluir</button>}
        </div>
      </>, document.body)}
    </div>
    {feedback && <span role="status" className={cn('absolute top-full z-10 mt-1 text-[11px] text-muted-foreground', message.mine ? 'right-0' : 'left-0')}>{feedback}</span>}
  </div>;
}
