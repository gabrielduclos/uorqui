import { useUorquiPreferences } from './UorquiPreferences';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Pencil, Pause, Play, X } from 'lucide-react';
import { DemoImageEditor } from './DemoImageEditor';
import { Button } from '@/components/ui/button';
import type { DemoAttachment } from './DemoMessageComposer';

/**
 * Self-contained media preview controls adapted from Uorqui Chat UX.
 * All sources are object URLs in the local, nonpersistent MVP demo.
 */
const RATES = [1, 1.5, 2] as const;
type Rate = (typeof RATES)[number];

function audioTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
}

export function DemoAudioPlayer({ src }: { src: string; name?: string }) {
  const { t } = useUorquiPreferences();
  const player = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<Rate>(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(false);
    if (player.current) {
      player.current.pause();
      player.current.playbackRate = rate;
    }
  }, [src]);

  useEffect(() => {
    if (player.current) player.current.playbackRate = rate;
  }, [rate]);

  async function toggle() {
    const audio = player.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    try { await audio.play(); setError(false); }
    catch { setError(true); setPlaying(false); }
  }

  return <div className="mt-1 flex w-full max-w-[340px] min-w-[min(280px,100%)] flex-col gap-1 border border-current/15 bg-black/10 px-2.5 py-2 text-current" aria-label={t('Mensagem de áudio')}>
    <audio ref={player} src={src} preload="metadata"
      onLoadedMetadata={event => { const value = event.currentTarget.duration; setDuration(Number.isFinite(value) ? value : 0); event.currentTarget.playbackRate = rate; }}
      onDurationChange={event => { const value = event.currentTarget.duration; if (Number.isFinite(value)) setDuration(value); }}
      onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      onError={() => { setError(true); setPlaying(false); }} />
    <div className="flex min-w-0 items-center gap-2">
      <button type="button" onClick={() => void toggle()} aria-label={playing ? t('Pausar áudio') : t('Reproduzir áudio')} className="grid size-9 shrink-0 place-items-center border border-current/15 bg-current/10 hover:bg-current/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="size-4" fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <input type="range" min={0} max={Math.max(duration, 0.1)} step={0.1} value={Math.min(currentTime, duration || 0)}
          aria-label={t('Posição do áudio')} onChange={event => { const value = Number(event.target.value); if (player.current) player.current.currentTime = value; setCurrentTime(value); }}
          className="block h-5 w-full cursor-pointer accent-current" />
        <div className="flex justify-between gap-1 text-[10px] tabular-nums opacity-75">
          <span>{audioTime(currentTime)}</span><span>{audioTime(duration)}</span>
        </div>
      </div>
      <button type="button" onClick={() => setRate(previous => RATES[(RATES.indexOf(previous) + 1) % RATES.length])} aria-label={t("Alterar velocidade do áudio, atual ") + String(rate) + t(" vezes")} title="Velocidade" className="h-9 min-w-11 shrink-0 border border-current/20 px-1 text-xs font-semibold tabular-nums hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-ring">{rate}×</button>
    </div>
    {error && <p role="alert" className="text-xs">{t("Não foi possível reproduzir este áudio.")}</p>}
  </div>;
}

export type PreviewMediaItem = {
  id: number;
  attachment: DemoAttachment;
};

export function DemoMediaViewer({ items, selectedId, onSelect, onClose, onImageEdited }: {
  items: PreviewMediaItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
  onImageEdited?: (id: number, image: Blob) => void;
}) {
  const { t } = useUorquiPreferences();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [selectedId]);
  const index = items.findIndex(item => item.id === selectedId);
  const active = items[index];

  useEffect(() => {
    if (selectedId === null) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => { previous?.focus(); };
  }, [selectedId === null]);

  useEffect(() => {
    if (selectedId === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); if (editing) setEditing(false); else onClose(); }
      if (!editing && event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); onSelect(items[index - 1].id); }
      if (!editing && event.key === 'ArrowRight' && index < items.length - 1) { event.preventDefault(); onSelect(items[index + 1].id); }
      if (event.key === 'Tab') {
        const dialog = document.getElementById('demo-media-dialog');
        const focusables = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], video[controls]');
        if (!focusables?.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, index, items, onClose, onSelect, editing]);

  if (selectedId === null || !active) return null;

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3 text-white sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div id="demo-media-dialog" role="dialog" aria-modal="true" aria-label={t("Visualizador de mídias")} className="flex h-full max-h-[94dvh] w-full max-w-6xl flex-col outline-none">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/15 pb-3">
        <p className="min-w-0 flex-1 truncate text-sm">{active.attachment.kind === 'image' ? (editing ? 'Editar foto' : t("Foto")) : 'Vídeo'}</p>
        <span className="shrink-0 text-xs text-white/70">{index + 1} de {items.length}</span>
        {active.attachment.kind === 'image' && !!onImageEdited && !editing && <button type="button" onClick={() => setEditing(true)} aria-label={t('Editar foto')} className="flex min-h-10 items-center gap-2 border border-white/20 px-3 text-xs hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"><Pencil className="size-4" /><span className="hidden sm:inline">Editar foto</span></button>}
        <a href={active.attachment.url} download={active.attachment.name} aria-label={t("Baixar mídia")} className="grid size-10 shrink-0 place-items-center rounded-md hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"><Download className="size-5" /></a>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={t('Fechar visualizador')} className="grid size-10 shrink-0 place-items-center rounded-md hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"><X className="size-5" /></button>
      </div>
      {editing && active.attachment.kind === 'image' && onImageEdited
        ? <DemoImageEditor key={active.attachment.url} src={active.attachment.url} onCancel={() => setEditing(false)} onSave={image => { onImageEdited(active.id, image); setEditing(false); }} />
        : <div className="flex min-h-0 flex-1 items-center justify-between gap-1 py-4 sm:gap-4">
          <button type="button" aria-label={t("Mídia anterior")} onClick={() => index > 0 && onSelect(items[index - 1].id)} disabled={index === 0} className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-white/15 disabled:opacity-25 sm:size-11"><ChevronLeft className="size-6" /></button>
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
            {active.attachment.kind === 'image'
              ? <img key={active.id} src={active.attachment.url} alt={t("Foto compartilhada")} className="max-h-[76dvh] max-w-full object-contain" />
              : <video key={active.id} src={active.attachment.url} controls playsInline preload="metadata" aria-label={t("Vídeo compartilhado")} className="max-h-[76dvh] max-w-full" />}
          </div>
          <button type="button" aria-label={t('Próxima mídia')} onClick={() => index < items.length - 1 && onSelect(items[index + 1].id)} disabled={index === items.length - 1} className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-white/15 disabled:opacity-25 sm:size-11"><ChevronRight className="size-6" /></button>
        </div>}
      {!editing && <p className="hidden shrink-0 text-center text-xs text-white/60 sm:block">{t("Use ← → para navegar · Esc para fechar")}</p>}
    </div>
  </div>;
}
