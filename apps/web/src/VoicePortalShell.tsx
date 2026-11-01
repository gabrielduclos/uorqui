import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { GripHorizontal } from 'lucide-react';

type Bounds = { top: number; left: number; width: number; height: number };
type Point = { x: number; y: number };
type Drag = { pointerId: number; originX: number; originY: number; startX: number; startY: number };

/**
 * Keep a single mounted WebRTC component. In full mode its portal is positioned
 * exactly over the room's content panel, not over the whole application.
 * In floating mode the same DOM subtree becomes a draggable mini-player.
 * Never swap portal containers: doing so would unmount and drop the call.
 */
export function VoicePortalShell({ floating, anchorRef, children, pt }: {
  floating: boolean;
  anchorRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  pt: boolean;
}) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  useLayoutEffect(() => {
    if (floating) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = anchor.getBoundingClientRect();
        const next = { top: r.top, left: r.left, width: r.width, height: r.height };
        setBounds(prev => prev &&
          prev.top === next.top && prev.left === next.left &&
          prev.width === next.width && prev.height === next.height ? prev : next);
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [floating, anchorRef]);

  function clamp(x: number, y: number): Point {
    const box = frameRef.current?.getBoundingClientRect();
    const width = box?.width ?? Math.min(368, window.innerWidth - 24);
    const height = box?.height ?? 140;
    return {
      x: Math.max(8, Math.min(x, Math.max(8, window.innerWidth - width - 8))),
      y: Math.max(32, Math.min(y, Math.max(32, window.innerHeight - height - 8))),
    };
  }
  function beginDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId, originX: event.clientX, originY: event.clientY,
      startX: rect.left, startY: rect.top,
    };
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clamp(drag.startX + event.clientX - drag.originX, drag.startY + event.clientY - drag.originY));
  }
  function stopDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  useEffect(() => {
    if (!floating || !position) return;
    const update = () => setPosition(p => p ? clamp(p.x, p.y) : p);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [floating, position !== null]);

  return (
    <div ref={frameRef}
      className={floating
        ? 'fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-[180] w-[min(23rem,calc(100vw-1.5rem))] md:bottom-5 md:right-5'
        : 'fixed z-[35] min-h-0 overflow-hidden bg-background'}
      style={floating
        ? position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined
        : bounds && bounds.width > 0 && bounds.height > 0
          ? { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height }
          : { visibility: 'hidden', pointerEvents: 'none' }}>
      {floating && (
        <button type="button"
          className="absolute -top-6 left-1/2 z-10 flex h-7 w-24 -translate-x-1/2 touch-none items-center justify-center rounded-t-lg border border-b-0 border-border bg-card text-muted-foreground shadow-sm cursor-grab active:cursor-grabbing"
          aria-label={pt ? 'Arrastar janela da chamada' : 'Drag voice call window'}
          title={pt ? 'Arraste para mover a chamada' : 'Drag to move the call'}
          onPointerDown={beginDrag} onPointerMove={moveDrag}
          onPointerUp={stopDrag} onPointerCancel={stopDrag}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            const current = frameRef.current?.getBoundingClientRect();
            if (!current) return;
            const dx = event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0;
            const dy = event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0;
            setPosition(clamp(current.left + dx, current.top + dy));
          }}>
          <GripHorizontal className="size-5" aria-hidden="true" />
        </button>
      )}
      {children}
    </div>
  );
}
