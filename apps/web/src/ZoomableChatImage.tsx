import { useRef, useState, type PointerEvent } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';

type Position = { x: number; y: number };
type Zoom = Position & { scale: number };
type Pinch = { distance: number; start: Zoom; middle: Position };
const INITIAL: Zoom = { x: 0, y: 0, scale: 1 };
const MAX_ZOOM = 5;

function distance(first: Position, second: Position) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function ZoomableChatImage({ src, alt, locale = 'pt-BR' }: {
  src: string;
  alt: string;
  locale?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Position>());
  const down = useRef(new Map<number, Position>());
  const pinch = useRef<Pinch | null>(null);
  const previousPan = useRef<Position | null>(null);
  const lastTap = useRef<{ at: number; point: Position } | null>(null);
  const current = useRef<Zoom>(INITIAL);
  const [zoom, setZoom] = useState<Zoom>(INITIAL);
  const pt = locale === 'pt-BR';

  function limit(value: Zoom): Zoom {
    const scale = Math.min(MAX_ZOOM, Math.max(1, value.scale));
    const frame = viewport.current, photo = image.current;
    if (!frame || !photo || scale <= 1) return { ...INITIAL };
    const maxX = Math.max(0, (photo.offsetWidth * scale - frame.clientWidth) / 2);
    const maxY = Math.max(0, (photo.offsetHeight * scale - frame.clientHeight) / 2);
    return { scale, x: Math.max(-maxX, Math.min(maxX, value.x)), y: Math.max(-maxY, Math.min(maxY, value.y)) };
  }

  function apply(value: Zoom) {
    const next = limit(value);
    current.current = next;
    setZoom(next);
  }

  function local(point: Position): Position {
    const bounds = viewport.current?.getBoundingClientRect();
    return { x: point.x - (bounds?.left ?? 0), y: point.y - (bounds?.top ?? 0) };
  }

  function zoomAt(scale: number, point?: Position) {
    const frame = viewport.current;
    if (!frame) return;
    const anchor = point ?? { x: frame.clientWidth / 2, y: frame.clientHeight / 2 };
    const old = current.current;
    const newScale = Math.max(1, Math.min(MAX_ZOOM, scale));
    const factor = newScale / old.scale;
    apply({
      scale: newScale,
      x: old.x + (anchor.x - frame.clientWidth / 2 - old.x) * (1 - factor),
      y: old.y + (anchor.y - frame.clientHeight / 2 - old.y) * (1 - factor),
    });
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    down.current.set(event.pointerId, point);
    if (pointers.current.size === 1) previousPan.current = point;
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.max(1, distance(first, second)),
        start: { ...current.current },
        middle: local({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }),
      };
      lastTap.current = null;
    }
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size >= 2 && pinch.current) {
      const [first, second] = [...pointers.current.values()];
      const startPinch = pinch.current;
      const middle = local({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });
      const newScale = Math.max(1, Math.min(MAX_ZOOM, startPinch.start.scale * distance(first, second) / startPinch.distance));
      const frame = viewport.current;
      if (!frame) return;
      const factor = newScale / startPinch.start.scale;
      apply({
        scale: newScale,
        x: startPinch.start.x + middle.x - startPinch.middle.x
          + (startPinch.middle.x - frame.clientWidth / 2 - startPinch.start.x) * (1 - factor),
        y: startPinch.start.y + middle.y - startPinch.middle.y
          + (startPinch.middle.y - frame.clientHeight / 2 - startPinch.start.y) * (1 - factor),
      });
    } else if (pointers.current.size === 1 && previousPan.current && current.current.scale > 1) {
      apply({ ...current.current, x: current.current.x + point.x - previousPan.current.x, y: current.current.y + point.y - previousPan.current.y });
    }
    previousPan.current = point;
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    const initial = down.current.get(event.pointerId);
    if (!initial) return;
    const finalPoint = pointers.current.get(event.pointerId) ?? initial;
    if (pointers.current.size === 1 && !pinch.current && distance(initial, finalPoint) < 12) {
      const last = lastTap.current;
      const at = Date.now();
      if (last && at - last.at < 320 && distance(last.point, finalPoint) < 36) {
        zoomAt(current.current.scale > 1 ? 1 : 2.5, local(finalPoint));
        lastTap.current = null;
      } else lastTap.current = { at, point: finalPoint };
    }
    pointers.current.delete(event.pointerId);
    down.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    previousPan.current = pointers.current.size === 1 ? [...pointers.current.values()][0] : null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <div className="relative h-full min-h-0 w-full min-w-0 overflow-hidden">
    <div ref={viewport}
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ touchAction: 'none', cursor: zoom.scale > 1 ? 'grab' : 'zoom-in' }}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <img ref={image} src={src} alt={alt} draggable={false}
        className="max-h-full max-w-full select-none object-contain"
        style={{ transform: 'translate3d(' + zoom.x + 'px,' + zoom.y + 'px,0) scale(' + zoom.scale + ')', transformOrigin: 'center', userSelect: 'none', pointerEvents: 'none' }} />
    </div>
    <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-md border border-white/20 bg-black/75 p-1 text-white">
      <button type="button" onClick={() => zoomAt(zoom.scale / 1.5)} disabled={zoom.scale <= 1}
        aria-label={pt ? 'Diminuir zoom' : 'Zoom out'} className="grid size-9 place-items-center disabled:opacity-40"><ZoomOut className="size-4" /></button>
      <span className="min-w-12 text-center text-xs tabular-nums" aria-live="polite">{Math.round(zoom.scale * 100)}%</span>
      <button type="button" onClick={() => zoomAt(zoom.scale * 1.5)} disabled={zoom.scale >= MAX_ZOOM}
        aria-label={pt ? 'Aumentar zoom' : 'Zoom in'} className="grid size-9 place-items-center disabled:opacity-40"><ZoomIn className="size-4" /></button>
      {zoom.scale > 1 && <button type="button" onClick={() => apply(INITIAL)}
        aria-label={pt ? 'Restaurar tamanho' : 'Reset zoom'} className="grid size-9 place-items-center"><Maximize2 className="size-4" /></button>}
    </div>
  </div>;
}
