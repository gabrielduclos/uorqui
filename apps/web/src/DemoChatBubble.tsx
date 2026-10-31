import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useDragControls, useMotionValue, useTransform } from 'motion/react';
import { Copy, MoreHorizontal, Pencil, Reply, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DemoAttachmentView, type DemoAttachment } from './DemoMessageComposer';

/** Local preview data only. Production messaging will use its own API-backed message model. */
export type DemoMessage = {
  id: number;
  mine: boolean;
  text: string;
  time: string;
  attachment?: DemoAttachment;
  replyTo?: number;
  edited?: boolean;
};

export function messagePreview(message: DemoMessage): string {
  if (message.text.trim()) return message.text.trim().replace(/\s+/g, ' ').slice(0, 120);
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

export function DemoChatBubble({ message, quoted, onReply, onEdit, onDelete, onLocateReply }: {
  message: DemoMessage;
  quoted?: DemoMessage;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLocateReply: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

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
        {message.attachment && <DemoAttachmentView attachment={message.attachment} />}
        <div className={cn('mt-1 flex items-center justify-end gap-1 text-[11px]', message.mine ? 'text-white/75' : 'text-muted-foreground')}>
          {message.edited && <span>editada ·</span>}
          <time>{message.time}</time>
        </div>
      </div>
    </SwipeToReply>
    <div ref={menuRef} className={cn('relative flex shrink-0 items-start', message.mine && 'order-first')}>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Opções da mensagem" title="Opções da mensagem" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)} className="mt-1 size-8 text-muted-foreground opacity-80 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
        <MoreHorizontal className="size-4" />
      </Button>
      {open && <div role="menu" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }} className={cn('absolute top-9 z-20 min-w-36 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl', message.mine ? 'right-0' : 'left-0')}>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); onReply(); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><Reply className="size-4" />Responder</button>
        {message.text.trim() && <button type="button" role="menuitem" onClick={() => void copy()} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><Copy className="size-4" />Copiar texto</button>}
        {message.mine && !!message.text && !message.attachment && <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><Pencil className="size-4" />Editar</button>}
        {message.mine && <button type="button" role="menuitem" onClick={() => { setOpen(false); onDelete(); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-destructive hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><Trash2 className="size-4" />Excluir</button>}
      </div>}
    </div>
    {feedback && <span role="status" className={cn('absolute top-full z-10 mt-1 text-[11px] text-muted-foreground', message.mine ? 'right-0' : 'left-0')}>{feedback}</span>}
  </div>;
}
