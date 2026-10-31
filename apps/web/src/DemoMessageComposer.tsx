import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { FileAudio, FileText, Image, Mic, Paperclip, Play, Send, Square, Video, X, Reply, Pencil } from 'lucide-react';
import { DemoAudioPlayer } from './DemoChatMedia';
import { Button } from '@/components/ui/button';

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';
export type DemoAttachment = {
  kind: AttachmentKind;
  name: string;
  url: string;
  size: number;
  mimeType: string;
};
export type ComposePayload = { text: string; attachment?: DemoAttachment };

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILE_LABEL = '50 MB';
const COMPOSER_MIN_HEIGHT = 48;
const COMPOSER_MAX_HEIGHT = 208;

function resizeMessageField(field: HTMLTextAreaElement) {
  // Keep the scrollbar hidden while measuring so a one-line message never shows it.
  field.style.overflowY = 'hidden';
  field.style.height = 'auto';

  // scrollHeight includes padding, but excludes borders. Account for both borders
  // to avoid the unwanted desktop scrollbar when the textarea is nearly empty.
  const styles = window.getComputedStyle(field);
  const borderSize = (Number.parseFloat(styles.borderTopWidth) || 0) + (Number.parseFloat(styles.borderBottomWidth) || 0);
  const neededHeight = field.scrollHeight + borderSize;
  field.style.height = Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, neededHeight)) + 'px';
  field.style.overflowY = neededHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden';
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? Math.max(1, Math.ceil(bytes / 1024)) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function DemoAttachmentView({ attachment, onOpenMedia }: { attachment: DemoAttachment; onOpenMedia?: () => void }) {
  if (attachment.kind === 'image') {
    const image = <img src={attachment.url} alt={attachment.name} loading="lazy" className="max-h-72 max-w-full object-contain" />;
    return onOpenMedia
      ? <button type="button" aria-label={'Abrir foto ' + attachment.name} onClick={onOpenMedia} className="mt-1 block max-w-full overflow-hidden focus-visible:outline-2 focus-visible:outline-ring">{image}</button>
      : <a href={attachment.url} download={attachment.name} aria-label={'Baixar foto ' + attachment.name} className="mt-1 block w-fit max-w-full">{image}</a>;
  }
  if (attachment.kind === 'video') {
    return onOpenMedia
      ? <button type="button" onClick={onOpenMedia} aria-label={'Abrir vídeo ' + attachment.name} className="relative mt-1 block max-w-full overflow-hidden bg-black focus-visible:outline-2 focus-visible:outline-ring">
          <video src={attachment.url} muted playsInline preload="metadata" aria-hidden="true" className="pointer-events-none max-h-72 max-w-full" />
          <span className="absolute inset-0 grid place-items-center bg-black/20"><Play className="size-9 text-white" fill="currentColor" /></span>
        </button>
      : <video src={attachment.url} controls playsInline preload="metadata" aria-label={attachment.name} className="mt-1 max-h-72 w-full max-w-lg" />;
  }
  if (attachment.kind === 'audio') {
    return <DemoAudioPlayer src={attachment.url} name={attachment.name} />;
  }
  return <a href={attachment.url} download={attachment.name} className="mt-1 flex min-w-0 items-center gap-2 border border-current/20 px-3 py-2 underline underline-offset-2">
    <FileText aria-hidden="true" className="size-5 shrink-0" />
    <span className="min-w-0 flex-1 truncate text-sm">{attachment.name}</span>
    <span className="shrink-0 text-xs opacity-75">{formatSize(attachment.size)}</span>
  </a>;
}

export default function DemoMessageComposer({ onSend, placeholder, ariaLabel, replyPreview, onCancelReply, editing, onCancelEditing, draftText, onDraftChange }: {
  onSend: (payload: ComposePayload) => void;
  placeholder: string;
  ariaLabel: string;
  replyPreview?: { author: string; text: string } | null;
  onCancelReply?: () => void;
  editing?: { id: number; text: string } | null;
  onCancelEditing?: () => void;
  draftText?: string;
  onDraftChange?: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [editText, setEditText] = useState('');
  const activeText = editing ? editText : draftText ?? text;
  function updateText(next: string) {
    if (editing) setEditText(next);
    else if (onDraftChange) onDraftChange(next);
    else setText(next);
  }
  const [pending, setPending] = useState<DemoAttachment | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedKindRef = useRef<AttachmentKind>('file');
  const stagedRef = useRef<DemoAttachment | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (stagedRef.current) URL.revokeObjectURL(stagedRef.current.url);
    };
  }, []);

  useEffect(() => {
    if (!editing) return;
    setEditText(editing.text);
    if (stagedRef.current) replacePending(null);
    textareaRef.current?.focus();
  }, [editing?.id]);

  useLayoutEffect(() => {
    if (textareaRef.current) resizeMessageField(textareaRef.current);
  }, [activeText]);

  useEffect(() => {
    const row = textareaRef.current?.parentElement;
    if (!row || typeof ResizeObserver === 'undefined') return;

    let previousWidth = row.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = row.clientWidth;
      if (nextWidth === previousWidth) return;
      previousWidth = nextWidth;
      if (textareaRef.current) resizeMessageField(textareaRef.current);
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  function replacePending(next: DemoAttachment | null) {
    if (stagedRef.current) URL.revokeObjectURL(stagedRef.current.url);
    stagedRef.current = next;
    setPending(next);
  }

  function chooseFile(kind: AttachmentKind) {
    const input = fileInputRef.current;
    if (!input) return;
    selectedKindRef.current = kind;
    input.accept = kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : kind === 'audio' ? 'audio/*' : '';
    setPickerOpen(false);
    input.click();
  }

  function stageFile(file: File, kind: AttachmentKind) {
    if (editing) return;
    if ((kind !== 'file' && !file.type.startsWith(kind + '/')) || file.size === 0) {
      setError('Selecione um arquivo válido para a opção escolhida.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('O limite desta prévia é ' + MAX_FILE_LABEL + ' por arquivo.');
      return;
    }
    replacePending({ kind, name: file.name, url: URL.createObjectURL(file), size: file.size, mimeType: file.type });
    setError('');
  }

  function fileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) stageFile(file, selectedKindRef.current);
  }

  function pasteAttachment(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (editing) return;
    const image = Array.from(event.clipboardData.items).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
    if (!image) return;
    event.preventDefault();
    stageFile(image, 'image');
  }

  async function toggleRecording() {
    setPickerOpen(false);
    const active = recorderRef.current;
    if (active && active.state === 'recording') {
      active.stop();
      setIsRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('A gravação de áudio não está disponível neste navegador ou conexão.');
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      const mimeType = recorder.mimeType || 'audio/webm';
      recorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (!mountedRef.current) return;
        setIsRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        if (blob.size === 0) {
          setError('Nenhum áudio foi capturado. Tente novamente.');
          return;
        }
        if (blob.size > MAX_FILE_BYTES) {
          setError('Gravação excedeu o limite de ' + MAX_FILE_LABEL + '.');
          return;
        }
        const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        replacePending({
          kind: 'audio',
          name: 'gravacao-' + Date.now() + '.' + extension,
          url: URL.createObjectURL(blob),
          size: blob.size,
          mimeType,
        });
        setError('');
      };
      recorder.onerror = () => {
        audioChunksRef.current = [];
        setError('Não foi possível concluir a gravação.');
      };
      recorder.start();
      setIsRecording(true);
      setError('');
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setIsRecording(false);
      setError('Não foi possível acessar o microfone. Confira a permissão do navegador.');
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isRecording) return;
    const value = activeText.trim();
    if (!value && (editing || !pending)) return;
    onSend({ text: value, attachment: editing ? undefined : pending ?? undefined });
    // The sent message owns the object URL; otherwise revoke any discarded attachment.
    if (!editing) stagedRef.current = null;
    setPending(null);
    if (editing) setEditText('');
    else updateText('');
    setPickerOpen(false);
    setError('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && (editing || replyPreview)) {
      event.preventDefault();
      if (editing) onCancelEditing?.();
      else onCancelReply?.();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return <form onSubmit={submit} className="shrink-0 border-t border-border bg-card/60 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4 lg:px-8">
    <div className="flex w-full min-w-0 flex-col gap-2">
      {(editing || replyPreview) && <div className="flex items-center gap-3 border-l-2 border-primary bg-muted/55 px-3 py-2 text-sm">
        {editing ? <Pencil className="size-4 shrink-0 text-primary" /> : <Reply className="size-4 shrink-0 text-primary" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{editing ? 'Editando mensagem' : 'Respondendo a ' + replyPreview?.author}</p>
          <p className="truncate text-xs text-muted-foreground">{editing?.text ?? replyPreview?.text}</p>
        </div>
        <Button type="button" size="icon-sm" variant="ghost" aria-label={editing ? 'Cancelar edição' : 'Cancelar resposta'} onClick={() => editing ? onCancelEditing?.() : onCancelReply?.()}><X className="size-4" /></Button>
      </div>}
      {pending && <div className="flex max-w-full items-start gap-3 rounded-xl border border-border bg-muted/60 p-3">
        <div className="min-w-0 flex-1">
          <p className="mb-2 truncate text-xs font-medium">{pending.name} · {formatSize(pending.size)}</p>
          <DemoAttachmentView attachment={pending} />
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Remover anexo" onClick={() => replacePending(null)}><X className="size-4" /></Button>
      </div>}
      {isRecording && <p role="status" className="flex items-center gap-2 text-xs text-destructive">
        <span className="size-2 animate-pulse rounded-full bg-destructive" /> Gravando áudio — toque no botão quadrado para finalizar
      </p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex min-w-0 items-end gap-2">
        <div className="relative shrink-0">
          <input ref={fileInputRef} type="file" className="sr-only" tabIndex={-1} aria-label="Selecionar anexo" onChange={fileSelected} />
          <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Adicionar anexo" aria-haspopup="menu" aria-expanded={pickerOpen} disabled={isRecording || !!editing} onClick={() => setPickerOpen(open => !open)}><Paperclip className="size-5" /></Button>
          {pickerOpen && <div role="menu" aria-label="Escolher tipo de anexo" onKeyDown={event => { if (event.key === 'Escape') setPickerOpen(false); }} className="absolute bottom-full left-0 z-40 mb-2 w-52 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
            {([
              { kind: 'image', label: 'Foto', Icon: Image },
              { kind: 'video', label: 'Vídeo', Icon: Video },
              { kind: 'audio', label: 'Áudio do dispositivo', Icon: FileAudio },
              { kind: 'file', label: 'Arquivo', Icon: FileText },
            ] as const).map(item => <button key={item.kind} type="button" role="menuitem" onClick={() => chooseFile(item.kind)} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
              <item.Icon className="size-4" aria-hidden="true" />{item.label}
            </button>)}
          </div>}
        </div>
        <Button type="button" variant={isRecording ? 'destructive' : 'ghost'} size="icon" className="size-11 shrink-0" aria-label={isRecording ? 'Finalizar gravação' : 'Gravar áudio'} onClick={() => void toggleRecording()} disabled={!!editing} title={isRecording ? 'Finalizar gravação' : 'Gravar áudio pelo microfone'}>
          {isRecording ? <Square className="size-4" fill="currentColor" /> : <Mic className="size-5" />}
        </Button>
        <textarea ref={textareaRef} rows={1} aria-label={ariaLabel} value={activeText} onChange={event => updateText(event.target.value)} onKeyDown={handleKeyDown} onPaste={pasteAttachment} placeholder={editing ? 'Edite sua mensagem…' : placeholder} maxLength={2000} disabled={isRecording} className="min-h-12 max-h-52 min-w-0 flex-1 resize-none overflow-y-hidden rounded-xl border border-input bg-background px-3 py-2.5 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40" />
        <Button type="submit" aria-label={editing ? 'Salvar edição da mensagem' : 'Enviar mensagem de demonstração'} size="icon" disabled={isRecording || (!activeText.trim() && (!!editing || !pending))} className="size-11 shrink-0"><Send className="size-4" /></Button>
      </div>
      <p className="hidden text-right text-[11px] text-muted-foreground md:block">Enter para enviar · Shift+Enter para nova linha · Anexos limitados à prévia local</p>
    </div>
  </form>;
}
