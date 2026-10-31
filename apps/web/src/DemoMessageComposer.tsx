import { useUorquiPreferences } from './UorquiPreferences';
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Camera, FileText, Images, MapPin, Mic, Play, Plus, Send, Smile, Square, Video, X, Reply, Pencil } from 'lucide-react';
import { createPortal } from 'react-dom';
import { DemoImageEditor } from './DemoImageEditor';
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
export type DemoLocation = { latitude: number; longitude: number };
export type ComposePayload = { text: string; attachment?: DemoAttachment; location?: DemoLocation };

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILE_LABEL = '50 MB';
const EMOJI_GROUPS = [
  { label: 'Expressões', emojis: ['😀', '😃', '😁', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🥹', '😢', '😭', '😡', '🤔', '😴', '🤩', '😮'] },
  { label: 'Gestos', emojis: ['👍', '👎', '👏', '🙌', '🙏', '👋', '👌', '✌️', '🤝', '💪', '🫶', '👀'] },
  { label: 'Corações e símbolos', emojis: ['❤️', '🩷', '💜', '💙', '💚', '💔', '🔥', '✨', '🎉', '✅', '⭐', '🎮'] },
] as const;
const attachmentTitle = (attachment: DemoAttachment) =>
  attachment.kind === 'image' ? 'Foto' : attachment.kind === 'video' ? 'Vídeo' : attachment.kind === 'audio' ? 'Áudio' : 'Arquivo';
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
  const { t } = useUorquiPreferences();
  if (attachment.kind === 'image') {
    const image = <img src={attachment.url} alt={t("Foto compartilhada")} loading="lazy" className="max-h-72 max-w-full object-contain" />;
    return onOpenMedia
      ? <button type="button" aria-label={t('Abrir foto')} onClick={onOpenMedia} className="mt-1 block max-w-full overflow-hidden focus-visible:outline-2 focus-visible:outline-ring">{image}</button>
      : <a href={attachment.url} download={attachment.name} aria-label={t('Baixar foto')} className="mt-1 block w-fit max-w-full">{image}</a>;
  }
  if (attachment.kind === 'video') {
    return onOpenMedia
      ? <button type="button" onClick={onOpenMedia} aria-label={t("Abrir vídeo")} className="relative mt-1 block max-w-full overflow-hidden bg-black focus-visible:outline-2 focus-visible:outline-ring">
          <video src={attachment.url} muted playsInline preload="metadata" aria-hidden="true" className="pointer-events-none max-h-72 max-w-full" />
          <span className="absolute inset-0 grid place-items-center bg-black/20"><Play className="size-9 text-white" fill="currentColor" /></span>
        </button>
      : <video src={attachment.url} controls playsInline preload="metadata" aria-label={attachment.name} className="mt-1 max-h-72 w-full max-w-lg" />;
  }
  if (attachment.kind === 'audio') {
    return <DemoAudioPlayer src={attachment.url} />;
  }
  return <a href={attachment.url} download={attachment.name} className="mt-1 flex min-w-0 items-center gap-2 border border-current/20 px-3 py-2 underline underline-offset-2">
    <FileText aria-hidden="true" className="size-5 shrink-0" />
    <span className="min-w-0 flex-1 text-sm">{t("Arquivo")}</span>
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
  const { t } = useUorquiPreferences();
  const [text, setText] = useState('');
  const [editText, setEditText] = useState('');
  const activeText = editing ? editText : draftText ?? text;
  function updateText(next: string) {
    if (editing) setEditText(next);
    else if (onDraftChange) onDraftChange(next);
    else setText(next);
  }
  const [pending, setPending] = useState<DemoAttachment | null>(null);
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cameraOptions, setCameraOptions] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<DemoLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cameraKindRef = useRef<'image' | 'video'>('image');
  const controlsRef = useRef<HTMLDivElement>(null);
  const editorDialogRef = useRef<HTMLDivElement>(null);
  const closeEditorRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedKindRef = useRef<AttachmentKind>('file');
  const stagedRef = useRef<DemoAttachment | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mountedRef = useRef(true);
  const locationRequestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      locationRequestRef.current++;
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
    if (next?.kind !== 'image') setPhotoEditorOpen(false);
  }

  function saveEditedPhoto(blob: Blob) {
    if (blob.size === 0 || blob.size > MAX_FILE_BYTES) {
      setError(t("Não foi possível preparar a foto. O limite é ") + MAX_FILE_LABEL + '.');
      return;
    }
    replacePending({
      kind: 'image',
      name: 'foto-editada.png',
      url: URL.createObjectURL(blob),
      size: blob.size,
      mimeType: 'image/png',
    });
    setPhotoEditorOpen(false);
    setError('');
  }

  useEffect(() => {
    if (!photoEditorOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeEditorRef.current?.focus();
    return () => { previous?.focus(); };
  }, [photoEditorOpen]);

  function editorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setPhotoEditorOpen(false);
    }
    if (event.key !== 'Tab' || !editorDialogRef.current) return;
    const focusable = Array.from(editorDialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled])'));
    if (focusable.length === 0) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  useEffect(() => {
    if (!pickerOpen && !emojiOpen) return;
    function closeOutside(event: PointerEvent) {
      if (controlsRef.current && !controlsRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
        setCameraOptions(false);
        setEmojiOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [pickerOpen, emojiOpen]);

  function chooseFile() {
    const input = fileInputRef.current;
    if (!input) return;
    selectedKindRef.current = 'file';
    input.accept = '*/*';
    setPickerOpen(false);
    input.click();
  }

  function chooseGallery() {
    const input = fileInputRef.current;
    if (!input) return;
    selectedKindRef.current = 'file';
    input.accept = 'image/*,video/*';
    setPickerOpen(false);
    input.click();
  }

  function chooseCamera(kind: 'image' | 'video') {
    const input = cameraInputRef.current;
    if (!input) return;
    cameraKindRef.current = kind;
    input.accept = kind === 'image' ? 'image/*' : 'video/*';
    setPickerOpen(false);
    setCameraOptions(false);
    input.click();
  }

  function cameraFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) stageFile(file, cameraKindRef.current);
  }

  function chooseLocation() {
    setPickerOpen(false);
    setCameraOptions(false);
    if (!navigator.geolocation) {
      setError(t("Localização não disponível neste navegador."));
      return;
    }
    const requestId = ++locationRequestRef.current;
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      position => {
        if (!mountedRef.current || locationRequestRef.current !== requestId) return;
        setPendingLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        replacePending(null);
        setLocating(false);
      },
      error => {
        if (!mountedRef.current || locationRequestRef.current !== requestId) return;
        setError(error.code === 1 ? t("Permissão de localização negada. Autorize no navegador para compartilhar.") : t("Não foi possível obter a localização. Tente novamente."));
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  }

  function stageFile(file: File, kind: AttachmentKind) {
    if (editing) return;
    if ((kind !== 'file' && !file.type.startsWith(kind + '/')) || file.size === 0) {
      setError(t("Selecione um arquivo válido para a opção escolhida."));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(t("O limite desta prévia é ") + MAX_FILE_LABEL + t(" por arquivo."));
      return;
    }
    const actualKind: AttachmentKind = kind === 'file' ? (file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'file') : kind;
    replacePending({ kind: actualKind, name: file.name, url: URL.createObjectURL(file), size: file.size, mimeType: file.type });
    setPendingLocation(null);
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
      setError(t("A gravação de áudio não está disponível neste navegador ou conexão."));
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
          setError(t("Nenhum áudio foi capturado. Tente novamente."));
          return;
        }
        if (blob.size > MAX_FILE_BYTES) {
          setError(t("Gravação excedeu o limite de ") + MAX_FILE_LABEL + '.');
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
        setError(t("Não foi possível concluir a gravação."));
      };
      recorder.start();
      setIsRecording(true);
      setError('');
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setIsRecording(false);
      setError(t("Não foi possível acessar o microfone. Confira a permissão do navegador."));
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isRecording) return;
    const value = activeText.trim();
    if (!value && (editing || (!pending && !pendingLocation))) return;
    onSend({ text: value, attachment: editing ? undefined : pending ?? undefined, location: editing ? undefined : pendingLocation ?? undefined });
    // The sent message owns the object URL; otherwise revoke any discarded attachment.
    if (!editing) stagedRef.current = null;
    setPending(null);
    setPendingLocation(null);
    if (editing) setEditText('');
    else updateText('');
    setPickerOpen(false);
    setEmojiOpen(false);
    setError('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && (pickerOpen || emojiOpen)) {
      event.preventDefault();
      setPickerOpen(false);
      setEmojiOpen(false);
      return;
    }
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

  const canSend = Boolean(activeText.trim() || (!editing && (pending || pendingLocation)));

  return <form onSubmit={submit} className="shrink-0 border-t border-border bg-card/60 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4 lg:px-8">
    <div className="flex w-full min-w-0 flex-col gap-2">
      {(editing || replyPreview) && <div className="flex items-center gap-3 border-l-2 border-primary bg-muted/55 px-3 py-2 text-sm">
        {editing ? <Pencil className="size-4 shrink-0 text-primary" /> : <Reply className="size-4 shrink-0 text-primary" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{editing ? t("Editando mensagem") : t("Respondendo a ") + replyPreview?.author}</p>
          <p className="truncate text-xs text-muted-foreground">{editing?.text ?? replyPreview?.text}</p>
        </div>
        <Button type="button" size="icon-sm" variant="ghost" aria-label={editing ? t('Cancelar edição') : t('Cancelar resposta')} onClick={() => editing ? onCancelEditing?.() : onCancelReply?.()}><X className="size-4" /></Button>
      </div>}
      {pending && <div className="flex max-w-full items-start gap-3 rounded-xl border border-border bg-muted/60 p-3">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-xs font-medium">{t(attachmentTitle(pending))} · {formatSize(pending.size)}</p>
          <DemoAttachmentView attachment={pending} onOpenMedia={pending.kind === 'image' ? () => setPhotoEditorOpen(true) : undefined} />
          {pending.kind === 'image' && <Button type="button" variant="outline" size="sm" onClick={() => setPhotoEditorOpen(true)} className="mt-2 h-9 rounded-none"><Pencil className="size-4" />{t("Editar foto antes de enviar")}</Button>}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Remover anexo')} onClick={() => replacePending(null)}><X className="size-4" /></Button>
      </div>}
      {pendingLocation && <div className="flex items-center gap-3 border border-border bg-muted/50 px-3 py-2 text-sm">
        <MapPin className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">{t("Localização selecionada — pronta para compartilhar")}</span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Remover localização")} onClick={() => setPendingLocation(null)}><X className="size-4" /></Button>
      </div>}
      {isRecording && <p role="status" className="flex items-center gap-2 text-xs text-destructive">
        <span className="size-2 animate-pulse rounded-full bg-destructive" /> Gravando áudio — toque no botão quadrado para finalizar
      </p>}
      {locating && <p role="status" className="text-xs text-muted-foreground">{t("Solicitando localização ao navegador…")}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div ref={controlsRef} className="relative flex min-w-0 items-end gap-1 sm:gap-2">
        {pickerOpen && <div role="dialog" aria-label={t('Adicionar à conversa')} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setPickerOpen(false); setCameraOptions(false); } }} className="absolute bottom-full left-0 z-50 mb-2 w-full max-w-[520px] rounded-none border border-border bg-popover p-2 text-popover-foreground shadow-xl">
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <p className="truncate text-xs font-medium">{cameraOptions ? t("Câmera") : t("Adicionar")}</p>
            <button type="button" aria-label={t("Fechar anexos")} onClick={() => { setPickerOpen(false); setCameraOptions(false); }} className="grid size-7 shrink-0 place-items-center hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" /></button>
          </div>
          {cameraOptions ? <div className="grid grid-cols-3 gap-1">
            <button type="button" onClick={() => chooseCamera('image')} className="flex h-16 min-w-0 flex-col items-center justify-center gap-1 border border-border px-1 text-[11px] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><Camera className="size-5 text-primary" />{t("Foto")}</button>
            <button type="button" onClick={() => chooseCamera('video')} className="flex h-16 min-w-0 flex-col items-center justify-center gap-1 border border-border px-1 text-[11px] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><Video className="size-5 text-primary" />{t('Vídeo')}</button>
            <button type="button" onClick={() => setCameraOptions(false)} className="flex h-16 min-w-0 flex-col items-center justify-center gap-1 border border-border px-1 text-[11px] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><X className="size-5 text-muted-foreground" />{t("Voltar")}</button>
          </div> : <div className="grid grid-cols-4 gap-1">
            {([
              { label: t("Câmera"), Icon: Camera, action: () => setCameraOptions(true) },
              { label: t("Galeria"), Icon: Images, action: chooseGallery },
              { label: t("Arquivos"), Icon: FileText, action: chooseFile },
              { label: t("Localização"), Icon: MapPin, action: chooseLocation },
            ] as const).map(item => <button key={item.label} type="button" onClick={item.action} className="flex h-16 min-w-0 flex-col items-center justify-center gap-1 border border-border px-0.5 text-[10px] sm:text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
              <item.Icon className="size-5 shrink-0 text-primary" />{item.label}
            </button>)}
          </div>}
        </div>}
        <div className="shrink-0">
          <input ref={fileInputRef} type="file" className="sr-only" tabIndex={-1} aria-label={t('Selecionar anexo')} onChange={fileSelected} />
          <input ref={cameraInputRef} type="file" capture="environment" className="sr-only" tabIndex={-1} aria-label={t("Capturar mídia com a câmera")} onChange={cameraFileSelected} />
          <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 sm:size-11" aria-label={t("Adicionar anexo")} aria-haspopup="dialog" aria-expanded={pickerOpen} disabled={isRecording || !!editing} onClick={() => { setPickerOpen(open => !open); setEmojiOpen(false); setCameraOptions(false); }}><Plus className="size-6" /></Button>
        </div>
        <div className="relative min-w-0 flex-1">
          <textarea ref={textareaRef} rows={1} aria-label={ariaLabel} value={activeText} onChange={event => updateText(event.target.value)} onKeyDown={handleKeyDown} onPaste={pasteAttachment} placeholder={editing ? t('Edite sua mensagem…') : placeholder} maxLength={2000} disabled={isRecording} className="block min-h-12 max-h-52 w-full min-w-0 resize-none overflow-y-hidden rounded-xl border border-input bg-background px-3 py-2.5 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40" />
          {emojiOpen && <div role="dialog" aria-label={t('Lista de emojis')} onKeyDown={event => { if (event.key === 'Escape') setEmojiOpen(false); }} className="absolute bottom-full right-0 z-50 mb-2 w-[min(340px,calc(100vw-24px))] rounded-none border border-border bg-popover p-3 text-popover-foreground shadow-xl">
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold">{t("Emojis")}</p><button type="button" aria-label={t('Fechar emojis')} onClick={() => setEmojiOpen(false)} className="grid size-7 place-items-center hover:bg-accent"><X className="size-4" /></button></div>
            <div className="max-h-64 overflow-y-auto">
              {EMOJI_GROUPS.map(group => <section key={t(group.label)} className="mb-3">
                <p className="mb-1 text-xs text-muted-foreground">{group.label}</p>
                <div className="grid grid-cols-6 gap-1">{group.emojis.map(emoji => <button type="button" key={emoji} aria-label={t('Emojis') + ' ' + emoji} onMouseDown={event => event.preventDefault()} onClick={() => { updateText(activeText + emoji); textareaRef.current?.focus(); }} className="grid size-10 place-items-center text-xl hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{emoji}</button>)}</div>
              </section>)}
            </div>
          </div>}
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 sm:size-11" aria-label={t("Abrir lista de emojis")} aria-haspopup="dialog" aria-expanded={emojiOpen} disabled={isRecording || !!editing} onClick={() => { setEmojiOpen(open => !open); setPickerOpen(false); }}><Smile className="size-5" /></Button>
        <Button type={isRecording || !canSend ? 'button' : 'submit'} variant={isRecording ? 'destructive' : !canSend ? 'ghost' : 'default'} size="icon"
          aria-label={t(isRecording ? t("Finalizar gravação") : canSend ? (editing ? t("Salvar edição da mensagem") : t("Enviar mensagem de demonstração")) : t("Gravar áudio"))}
          disabled={locating || (!!editing && !canSend)}
          title={isRecording ? t("Finalizar gravação") : canSend ? t("Enviar") : t("Gravar áudio")}
          onClick={isRecording || !canSend ? () => void toggleRecording() : undefined}
          className="size-10 shrink-0 sm:size-11">
          {isRecording ? <Square className="size-4" fill="currentColor" /> : canSend ? <Send className="size-5" /> : <Mic className="size-5" />}
        </Button>
      </div>
      {photoEditorOpen && pending?.kind === 'image' && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 p-2 text-white sm:p-5">
          <div ref={editorDialogRef} role="dialog" aria-modal="true" aria-label={t("Editar foto antes de enviar")} onKeyDown={editorKeyDown} className="flex h-full max-h-[96dvh] w-full max-w-6xl min-w-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/15 px-1 py-2">
              <p className="text-sm font-semibold">{t("Editar foto antes de enviar")}</p>
              <button ref={closeEditorRef} type="button" aria-label={t("Fechar editor de foto")} onClick={() => setPhotoEditorOpen(false)} className="grid size-10 place-items-center hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"><X className="size-5" /></button>
            </div>
            <DemoImageEditor key={pending.url} src={pending.url} onCancel={() => setPhotoEditorOpen(false)} onSave={saveEditedPhoto} />
          </div>
        </div>, document.body
      )}
    </div>
  </form>;
}
