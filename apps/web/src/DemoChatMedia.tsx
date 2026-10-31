import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DemoAttachment } from './DemoMessageComposer';

/**
 * Self-contained media preview controls adapted from Uorqui Chat UX.
 * All sources are object URLs in the local, nonpersistent MVP demo.
 */
const RATES = [1, 1.5, 2] as const;
type Rate = (typeof RATES)[number];

export function DemoAudioPlayer({ src, name }: { src: string; name: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState<Rate>(1);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate, src]);

  useEffect(() => () => {
    const player = audio.current;
    if (player) player.pause();
  }, []);

  function cycleRate() {
    setRate(previous => RATES[(RATES.indexOf(previous) + 1) % RATES.length]);
  }

  return <div className="mt-1 flex w-full min-w-0 max-w-sm items-center gap-2" aria-label={'Reproduzir ' + name}>
    <audio ref={audio} src={src} controls preload="metadata" onLoadedMetadata={event => { event.currentTarget.playbackRate = rate; }} aria-label={name} className="h-10 min-w-0 flex-1" />
    <Button type="button" variant="outline" size="sm" className="h-9 min-w-12 shrink-0 rounded-md px-2 text-xs tabular-nums" onClick={cycleRate} aria-label={'Velocidade de reprodução ' + String(rate).replace('.', ',') + ' vezes. Alterar velocidade'} title="Alterar velocidade do áudio">
      {rate}×
    </Button>
  </div>;
}

export type PreviewMediaItem = {
  id: number;
  attachment: DemoAttachment;
};

export function DemoMediaViewer({ items, selectedId, onSelect, onClose }: {
  items: PreviewMediaItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
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
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); onSelect(items[index - 1].id); }
      if (event.key === 'ArrowRight' && index < items.length - 1) { event.preventDefault(); onSelect(items[index + 1].id); }
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
  }, [selectedId, index, items, onClose, onSelect]);

  if (selectedId === null || !active) return null;

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3 text-white sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div id="demo-media-dialog" role="dialog" aria-modal="true" aria-label="Visualizador de mídias" className="flex h-full max-h-[94dvh] w-full max-w-6xl flex-col outline-none">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/15 pb-3">
        <p className="min-w-0 flex-1 truncate text-sm">{active.attachment.name}</p>
        <span className="shrink-0 text-xs text-white/70">{index + 1} de {items.length}</span>
        <a href={active.attachment.url} download={active.attachment.name} aria-label="Baixar mídia" className="grid size-10 shrink-0 place-items-center rounded-md hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"><Download className="size-5" /></a>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar visualizador" className="grid size-10 shrink-0 place-items-center rounded-md hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"><X className="size-5" /></button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-between gap-1 py-4 sm:gap-4">
        <button type="button" aria-label="Mídia anterior" onClick={() => index > 0 && onSelect(items[index - 1].id)} disabled={index === 0} className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-white/15 disabled:opacity-25 sm:size-11"><ChevronLeft className="size-6" /></button>
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
          {active.attachment.kind === 'image'
            ? <img key={active.id} src={active.attachment.url} alt={active.attachment.name} className="max-h-[76dvh] max-w-full object-contain" />
            : <video key={active.id} src={active.attachment.url} controls playsInline preload="metadata" aria-label={active.attachment.name} className="max-h-[76dvh] max-w-full" />}
        </div>
        <button type="button" aria-label="Próxima mídia" onClick={() => index < items.length - 1 && onSelect(items[index + 1].id)} disabled={index === items.length - 1} className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-white/15 disabled:opacity-25 sm:size-11"><ChevronRight className="size-6" /></button>
      </div>
      <p className="hidden shrink-0 text-center text-xs text-white/60 sm:block">Use ← → para navegar · Esc para fechar</p>
    </div>
  </div>;
}
