import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUorquiPreferences } from './UorquiPreferences';

export type ProfileImageKind = 'avatar' | 'cover';
const sizes = { avatar: [640, 640], cover: [1440, 480] } as const;

export function ProfilePhotoCropper({ file, kind, onSave, onCancel }: {
  file: File; kind: ProfileImageKind; onSave: (blob: Blob) => Promise<void>; onCancel: () => void;
}) {
  const { locale } = useUorquiPreferences();
  const pt = locale === 'pt-BR';
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [width, height] = sizes[kind];

  useEffect(() => {
    let active = true;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { if (active) { image.current = img; setLoaded(true); } };
    img.onerror = () => { if (active) setError(pt ? 'Imagem inválida.' : 'Invalid image.'); };
    img.src = url;
    return () => { active = false; image.current = null; URL.revokeObjectURL(url); };
  }, [file, pt]);

  function overflow() {
    const img = image.current;
    if (!img) return { dx: 0, dy: 0, w: 0, h: 0 };
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight) * zoom;
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    return { dx: Math.max(0, (w - width) / 2), dy: Math.max(0, (h - height) / 2), w, h };
  }

  useEffect(() => {
    const surface = canvas.current, img = image.current;
    if (!loaded || !surface || !img) return;
    surface.width = width; surface.height = height;
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    const { dx, dy, w, h } = overflow();
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (width - w) / 2 + pan.x * dx, (height - h) / 2 + pan.y * dy, w, h);
  }, [loaded, kind, zoom, pan]);

  function pointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (!loaded) return;
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drag.current) return;
    const { dx, dy } = overflow();
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = width / Math.max(1, rect.width);
    const sy = height / Math.max(1, rect.height);
    setPan({
      x: dx ? Math.max(-1, Math.min(1, drag.current.panX + (e.clientX - drag.current.x) * sx / dx)) : 0,
      y: dy ? Math.max(-1, Math.min(1, drag.current.panY + (e.clientY - drag.current.y) * sy / dy)) : 0,
    });
  }
  async function finish() {
    if (!canvas.current || busy || !loaded) return;
    setBusy(true); setError('');
    try {
      const output = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(blob => blob ? resolve(blob) : reject(new Error('encode')), 'image/webp', 0.82));
      if (!['image/webp', 'image/jpeg', 'image/png'].includes(output.type) || output.size > 3 * 1024 * 1024) throw new Error('size');
      await onSave(output);
    } catch {
      setError(pt ? 'Não foi possível enviar a foto. Tente novamente.' : 'Could not upload the photo. Try again.');
    } finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-3 text-white" onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); onCancel(); } }}>
    <section role="dialog" aria-modal="true" aria-label={pt ? 'Recortar foto' : 'Crop photo'} className="flex max-h-[94dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-xl border border-white/15 bg-[#111827] p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{kind === 'avatar' ? pt ? 'Foto de perfil' : 'Profile photo' : pt ? 'Foto de capa' : 'Cover photo'}</h2>
          <p className="text-xs text-white/70">{pt ? 'Arraste para ajustar o enquadramento.' : 'Drag to adjust the crop.'}</p></div>
        <button type="button" disabled={busy} onClick={onCancel} className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-white/10" aria-label={pt ? 'Fechar' : 'Close'}><X className="size-5" /></button>
      </div>
      <canvas ref={canvas} width={width} height={height} role="img" aria-label={pt ? 'Prévia do recorte' : 'Crop preview'}
        className="block h-auto max-h-[54dvh] w-full cursor-grab touch-none rounded-md bg-black/40 object-contain"
        style={{ aspectRatio: width + ' / ' + height }}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
      <label className="flex items-center gap-3 text-sm"><span>Zoom</span>
        <input className="min-w-0 flex-1 accent-indigo-500" type="range" min="1" max="3" step="0.05" value={zoom} onChange={event => setZoom(Number(event.target.value))} />
        <span className="w-10 text-right text-xs tabular-nums">{zoom.toFixed(1)}×</span>
        <button type="button" title={pt ? 'Restaurar enquadramento' : 'Reset crop'} aria-label={pt ? 'Restaurar enquadramento' : 'Reset crop'} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw className="size-4" /></button>
      </label>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{pt ? 'Cancelar' : 'Cancel'}</Button>
        <Button type="button" disabled={busy || !loaded} onClick={() => void finish()}><Check className="size-4" />{busy ? pt ? 'Enviando…' : 'Uploading…' : pt ? 'Salvar foto' : 'Save photo'}</Button>
      </div>
    </section>
  </div>;
}
