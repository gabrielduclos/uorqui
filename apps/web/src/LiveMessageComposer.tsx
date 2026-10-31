import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { Camera, FileText, Images, MapPin, Mic, Plus, Send, Smile, Video, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const EMOJI_GROUPS = [
  { pt: 'Expressões', en: 'Expressions', symbols: ['😀','😃','😁','😂','🤣','😊','😍','🥰','😘','😎','🥹','😢','😭','😡','🤔','😴','🤩','😮'] },
  { pt: 'Gestos', en: 'Gestures', symbols: ['👍','👎','👏','🙌','🙏','👋','👌','✌️','🤝','💪','🫶','👀'] },
  { pt: 'Corações e símbolos', en: 'Hearts and symbols', symbols: ['❤️','🩷','💜','💙','💚','💔','🔥','✨','🎉','✅','⭐','🎮'] },
] as const;

const ATTACHMENTS = [
  { icon: Images, pt: 'Galeria', en: 'Gallery' },
  { icon: Camera, pt: 'Câmera', en: 'Camera' },
  { icon: Video, pt: 'Vídeo', en: 'Video' },
  { icon: FileText, pt: 'Arquivo', en: 'File' },
  { icon: MapPin, pt: 'Localização', en: 'Location' },
] as const;

export function LiveMessageComposer({ value, onChange, onSubmit, onAttach, sending, locale, textareaRef, editing = false }: {
  value: string; onChange: (text: string) => void; onSubmit: () => void; onAttach: (file: File) => void;
  sending: boolean; locale: string; textareaRef: RefObject<HTMLTextAreaElement | null>; editing?: boolean;
}) {
  const pt = locale === 'pt-BR';
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const controls = useRef<HTMLFormElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = !!value.trim() && !sending;
  const maxHeight = 208;

  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.overflowY = 'hidden';
    node.style.height = 'auto';
    const height = Math.min(maxHeight, Math.max(48, node.scrollHeight));
    node.style.height = height + 'px';
    node.style.overflowY = node.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, textareaRef]);

  useEffect(() => {
    if (!emojiOpen && !attachmentsOpen) return;
    const outside = (event: PointerEvent) => {
      if (!controls.current?.contains(event.target as Node)) {
        setEmojiOpen(false);
        setAttachmentsOpen(false);
      }
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setEmojiOpen(false);
        setAttachmentsOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [emojiOpen, attachmentsOpen]);

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) onSubmit();
  }

  return <form ref={controls} onSubmit={submit}
    className="relative flex w-full min-w-0 items-end gap-1 sm:gap-2" data-live-message-composer>
    <div className="relative shrink-0">
      <button type="button" aria-label={pt ? 'Adicionar anexo' : 'Add attachment'}
        aria-expanded={attachmentsOpen} aria-haspopup="dialog"
        onClick={() => { setAttachmentsOpen(v => !v); setEmojiOpen(false); }}
        className="grid size-11 place-items-center text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        <Plus className="size-6" />
      </button>
      {attachmentsOpen && <div role="dialog" aria-label={pt ? 'Adicionar à conversa' : 'Add to chat'}
        className="absolute bottom-full left-0 z-40 mb-2 w-[min(510px,calc(100vw-24px))] max-w-[calc(100vw-24px)] border border-border bg-popover p-2 text-popover-foreground shadow-xl">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs font-semibold">{pt ? 'Adicionar à conversa' : 'Add to conversation'}</span>
          <button type="button" onClick={() => setAttachmentsOpen(false)}
            aria-label={pt ? 'Fechar anexos' : 'Close attachments'} className="grid size-8 place-items-center hover:bg-accent">
            <X className="size-4"/>
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {ATTACHMENTS.map(({icon: Icon,pt:labelPt,en},index) => <button key={en} type="button"
            disabled={index===4 || sending || editing}
            onClick={() => {
              [galleryRef,cameraRef,videoRef,fileRef][index]?.current?.click();
              setAttachmentsOpen(false);
            }}
            title={index===4 ? (pt ? 'Compartilhar localização em etapa futura' : 'Location sharing coming later') : undefined}
            className="flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 border border-border/70 px-0.5 text-[10px] hover:bg-accent disabled:opacity-40"
            aria-label={pt ? labelPt : en}>
            <Icon className="size-5 text-primary"/><span className="truncate">{pt ? labelPt : en}</span>
          </button>)}
        </div>
        <p className="px-2 pt-2 text-[11px] text-muted-foreground">
          {pt ? 'Imagens, vídeos e arquivos de até 20 MB. O anexo é enviado como mensagem própria.' : 'Images, videos and files up to 20 MB. Each attachment sends as its own message.'}
        </p>
      </div>}
    </div>
    <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only"
      onChange={e => { const file=e.target.files?.[0]; e.target.value=''; if(file) onAttach(file); }} />
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only"
      onChange={e => { const file=e.target.files?.[0]; e.target.value=''; if(file) onAttach(file); }} />
    <input ref={videoRef} type="file" accept="video/mp4,video/webm" className="sr-only"
      onChange={e => { const file=e.target.files?.[0]; e.target.value=''; if(file) onAttach(file); }} />
    <input ref={fileRef} type="file" accept=".pdf,.txt,.zip,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/octet-stream" className="sr-only"
      onChange={e => { const file=e.target.files?.[0]; e.target.value=''; if(file) onAttach(file); }} />
    <textarea ref={textareaRef} rows={1} value={value}
      onChange={event => onChange(event.target.value)} onKeyDown={keyDown} maxLength={4000}
      aria-label={pt ? 'Escrever mensagem' : 'Write a message'}
      data-message-composer placeholder={editing ? (pt ? 'Editar mensagem…' : 'Edit message…') : (pt ? 'Mensagem…' : 'Message…')}
      className="min-h-12 max-h-52 min-w-0 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-3 text-base leading-6 text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
    />
    <div className="relative shrink-0">
      <button type="button" aria-label={pt ? 'Abrir lista de emojis' : 'Open emoji picker'}
        aria-expanded={emojiOpen} aria-haspopup="dialog"
        onClick={() => { setEmojiOpen(v => !v); setAttachmentsOpen(false); }}
        className="grid size-11 place-items-center text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        <Smile className="size-5"/>
      </button>
      {emojiOpen && <div role="dialog" aria-label={pt ? 'Emojis' : 'Emojis'}
        className="absolute bottom-full right-0 z-40 mb-2 w-[min(340px,calc(100vw-24px))] max-h-[min(360px,55dvh)] overflow-y-auto border border-border bg-popover p-3 text-popover-foreground shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold">{pt ? 'Emojis' : 'Emojis'}</p>
          <button type="button" aria-label={pt ? 'Fechar emojis' : 'Close emojis'}
            onClick={() => setEmojiOpen(false)} className="grid size-8 place-items-center hover:bg-accent">
            <X className="size-4"/>
          </button>
        </div>
        {EMOJI_GROUPS.map(group => <section key={group.en} className="mb-3">
          <p className="mb-1 text-xs text-muted-foreground">{pt ? group.pt : group.en}</p>
          <div className="grid grid-cols-6 gap-1">
            {group.symbols.map(emoji => <button type="button" key={emoji}
              aria-label={emoji} onMouseDown={event => event.preventDefault()}
              onClick={() => { onChange(value + emoji); textareaRef.current?.focus({ preventScroll: true }); }}
              className="grid size-10 place-items-center text-xl hover:bg-accent">{emoji}</button>)}
          </div>
        </section>)}
      </div>}
    </div>
    {canSend
      ? <button type="submit" aria-label={pt ? 'Enviar mensagem' : 'Send message'}
        className="grid size-11 shrink-0 place-items-center bg-primary text-primary-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Send className="size-5"/>
      </button>
      : <button type="button" disabled
        title={pt ? 'Mensagens de áudio ainda não estão conectadas ao chat real.' : 'Voice messages are not connected to live chat yet.'}
        aria-label={pt ? 'Gravar áudio (indisponível)' : 'Record voice note (not available)'}
        className={cn('grid size-11 shrink-0 place-items-center text-muted-foreground', sending && 'opacity-40')}>
        <Mic className="size-5"/>
      </button>}
  </form>;
}
