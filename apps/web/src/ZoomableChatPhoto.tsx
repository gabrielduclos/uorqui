import { useCallback, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

type Point = { x: number; y: number };
type Gesture = { distance: number; scale: number; offset: Point; center: Point };
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Zoom, pinch and pan without changing the global page scale or the original media. */
export function ZoomableChatPhoto({ src, alt, locale = 'pt-BR' }: {
  src: string;
  alt: string;
  locale?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<Gesture | null>(null);
  const drag = useRef<Point | null>(null);
  const moved = useRef(false);
  const usedPinch = useRef(false);
  const lastTap = useRef<{ at: number; point: Point } | null>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const pt = locale === 'pt-BR';

  const clampOffset = useCallback((point: Point, nextScale: number): Point => {
    const stage = stageRef.current, image = imageRef.current;
    if (!stage || !image || nextScale <= MIN_ZOOM) return { x: 0, y: 0 };
    const xLimit = Math.max(0, (image.clientWidth * nextScale - stage.clientWidth) / 2);
    const yLimit = Math.max(0, (image.clientHeight * nextScale - stage.clientHeight) / 2);
    return { x: Math.max(-xLimit, Math.min(xLimit, point.x)), y: Math.max(-yLimit, Math.min(yLimit, point.y)) };
  }, []);

  const applyTransform = useCallback((nextScale: number, nextOffset: Point) => {
    const boundedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextScale));
    const boundedOffset = clampOffset(nextOffset, boundedScale);
    scaleRef.current = boundedScale;
    offsetRef.current = boundedOffset;
    setScale(boundedScale);
    setOffset(boundedOffset);
  }, [clampOffset]);

  const zoomTo = useCallback((requested: number, clientPoint?: Point) => {
    const current = scaleRef.current;
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, requested));
    const stage = stageRef.current;
    if (!stage || next === MIN_ZOOM) { applyTransform(next, { x: 0, y: 0 }); return; }
    const rect = stage.getBoundingClientRect();
    const focal = clientPoint ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const fromCenter = { x: focal.x - rect.left - rect.width / 2, y: focal.y - rect.top - rect.height / 2 };
    const ratio = next / current;
    applyTransform(next, {
      x: offsetRef.current.x + (1 - ratio) * (fromCenter.x - offsetRef.current.x),
      y: offsetRef.current.y + (1 - ratio) * (fromCenter.y - offsetRef.current.y),
    });
  }, [applyTransform]);

  function onDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 1) {
      drag.current = point;
      moved.current = false;
      usedPinch.current = false;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.max(1, distance(a, b)),
        scale: scaleRef.current,
        offset: { ...offsetRef.current },
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      drag.current = null;
      usedPinch.current = true;
      lastTap.current = null;
    }
  }

  function onMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    const previous = pointers.current.get(event.pointerId)!;
    if (distance(point, previous) > 2) moved.current = true;
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const start = pinch.current;
      const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, start.scale * distance(a, b) / start.distance));
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = nextScale / start.scale;
      const initialFocal = {
        x: start.center.x - rect.left - rect.width / 2,
        y: start.center.y - rect.top - rect.height / 2,
      };
      applyTransform(nextScale, {
        x: start.offset.x + center.x - start.center.x + (1 - ratio) * (initialFocal.x - start.offset.x),
        y: start.offset.y + center.y - start.center.y + (1 - ratio) * (initialFocal.y - start.offset.y),
      });
    } else if (pointers.current.size === 1 && drag.current) {
      if (scaleRef.current > MIN_ZOOM) {
        applyTransform(scaleRef.current, {
          x: offsetRef.current.x + point.x - drag.current.x,
          y: offsetRef.current.y + point.y - drag.current.y,
        });
      }
      drag.current = point;
    }
  }

  function onUp(event: PointerEvent<HTMLDivElement>) {
    const point = pointers.current.get(event.pointerId);
    if (!point) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = pointers.current.size === 1 ? [...pointers.current.values()][0] : null;
    if (pointers.current.size !== 0) return;
    if (event.type === 'pointerup' && event.pointerType === 'touch' && !moved.current && !usedPinch.current) {
      const now = Date.now();
      if (lastTap.current && now - lastTap.current.at < 320 && distance(point, lastTap.current.point) < 36) {
        zoomTo(scaleRef.current > 1 ? 1 : 2.5, point);
        lastTap.current = null;
      } else lastTap.current = { at: now, point };
    }
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomTo(scaleRef.current * (event.deltaY > 0 ? 0.85 : 1.15), { x: event.clientX, y: event.clientY });
  }

  return <div className="relative flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden">
    <div ref={stageRef} className="flex h-full w-full touch-none select-none items-center justify-center overflow-hidden"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onWheel={onWheel}
      onDoubleClick={event => { if (event.pointerType !== 'touch') zoomTo(scaleRef.current > 1 ? 1 : 2.5, { x: event.clientX, y: event.clientY }); }}>
      <img ref={imageRef} src={src} alt={alt} draggable={false}
        className="max-h-[76dvh] max-w-full select-none object-contain"
        style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`, transformOrigin: 'center center', willChange: 'transform' }} />
    </div>
    <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 border border-white/20 bg-black/80 p-1 text-white shadow-xl" role="group" aria-label={pt ? 'Zoom da foto' : 'Photo zoom'}>
      <button type="button" onClick={() => zoomTo(scaleRef.current / 1.5)} disabled={scale <= MIN_ZOOM}
        aria-label={pt ? 'Diminuir zoom' : 'Zoom out'} className="grid size-9 place-items-center hover:bg-white/15 disabled:opacity-35"><ZoomOut className="size-5"/></button>
      <span aria-live="polite" className="w-12 text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
      <button type="button" onClick={() => zoomTo(scaleRef.current * 1.5)} disabled={scale >= MAX_ZOOM}
        aria-label={pt ? 'Aumentar zoom' : 'Zoom in'} className="grid size-9 place-items-center hover:bg-white/15 disabled:opacity-35"><ZoomIn className="size-5"/></button>
      <button type="button" onClick={() => applyTransform(1, { x: 0, y: 0 })} disabled={scale <= MIN_ZOOM}
        aria-label={pt ? 'Restaurar tamanho original' : 'Reset zoom'} className="grid size-9 place-items-center hover:bg-white/15 disabled:opacity-35"><RotateCcw className="size-4"/></button>
    </div>
  </div>;
}
