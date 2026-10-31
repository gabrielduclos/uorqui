import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCheck, Copy, MoreHorizontal, Quote, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DirectChatMessage = {
  id: string; conversationId: string; authorId: string; body: string;
  clientId: string | null; createdAt: string; readAt: string | null;
};

export function DirectMessageBubble({ message, mine, locale, onQuote }: {
  message: DirectChatMessage; mine: boolean; locale: string; onQuote: (message: DirectChatMessage) => void;
}) {
  const pt = locale === 'pt-BR';
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const time = new Date(message.createdAt);
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
      const width = Math.min(212, viewportWidth - 16);
      const height = menu.current?.offsetHeight ?? 105;
      const preferredLeft = mine ? rect.right - width : rect.left;
      const left = Math.min(Math.max(preferredLeft, leftEdge + 8), leftEdge + viewportWidth - width - 8);
      const top = rect.bottom + height + 8 < topEdge + viewportHeight
        ? rect.bottom + 6 : rect.top - height - 6;
      setPosition({ left, top: Math.min(Math.max(topEdge + 8, top), topEdge + viewportHeight - height - 8), width });
    }
    place();
    const dismiss = (event: PointerEvent) => {
      if (trigger.current?.contains(event.target as Node) || menu.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [open, mine]);

  async function copyText() {
    try { await navigator.clipboard.writeText(message.body); } catch { /* leave text selectable */ }
    setOpen(false);
  }

  return <div data-direct-message-id={message.id} className={cn('group relative flex min-w-0 items-start gap-1.5', mine ? 'justify-end' : 'justify-start')}>
    <div className={cn('max-w-[calc(100vw-105px)] min-w-0 px-3.5 py-2.5 text-sm leading-6 sm:max-w-[min(72%,660px)]',
      mine ? 'rounded-[1.1rem] rounded-br-[0.3rem] bg-primary text-primary-foreground' :
        'rounded-[1.1rem] rounded-bl-[0.3rem] border border-border/80 bg-card text-foreground')}>
      <p className="whitespace-pre-wrap break-words">{message.body}</p>
      <div className={cn('mt-1 flex items-center justify-end gap-1.5 text-[10px]', mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
        <time dateTime={message.createdAt}>{timeLabel}</time>
        {mine && (message.readAt
          ? <CheckCheck className="size-3.5 text-sky-300" aria-label={pt ? 'Lida' : 'Read'}/>
          : <Check className="size-3.5" aria-label={pt ? 'Enviada' : 'Sent'}/>)}
      </div>
    </div>
    <button ref={trigger} type="button" onClick={() => { setPosition(null); setOpen(v => !v); }}
      aria-label={pt ? 'Opções da mensagem' : 'Message options'} aria-haspopup="menu" aria-expanded={open}
      className={cn('grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-opacity hover:bg-accent focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100',mine && 'order-first')}>
      <MoreHorizontal className="size-[18px]"/>
    </button>
    {open && typeof document !== 'undefined' && createPortal(<>
      <div aria-hidden="true" className="fixed inset-0 z-[90] bg-background/10 backdrop-blur-[3px]" onClick={() => setOpen(false)}/>
      <div ref={menu} role="menu" aria-label={pt ? 'Ações da mensagem' : 'Message actions'}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); trigger.current?.focus(); } }}
        className="fixed z-[91] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-2xl"
        style={{ left: position?.left ?? -9999, top: position?.top ?? -9999, width: position?.width ?? 212, visibility: position ? 'visible' : 'hidden' }}>
        <button role="menuitem" type="button" onClick={() => { setOpen(false); onQuote(message); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-accent"><Quote className="size-4"/>{pt ? 'Citar texto' : 'Quote text'}</button>
        <button role="menuitem" type="button" onClick={() => void copyText()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-accent"><Copy className="size-4"/>{pt ? 'Copiar' : 'Copy'}</button>
        <button role="menuitem" type="button" onClick={() => setOpen(false)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-accent"><X className="size-4"/>{pt ? 'Fechar' : 'Close'}</button>
      </div>
    </>, document.body)}
  </div>;
}
