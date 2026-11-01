import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react';

type Bounds = { top: number; left: number; width: number; height: number };
type Point = { x: number; y: number };
type Drag = { pointerId: number; originX: number; originY: number; startX: number; startY: number; dragging: boolean };

/**
 * Keep a single mounted WebRTC component. Expanded positioning follows the
 * room's actual content area; floating mode only wraps its compact controls.
 * Dragging is available from the whole floating panel without a grab handle.
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
        const rect = anchor.getBoundingClientRect();
        const next = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
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
    const width = box?.width ?? 290;
    const height = box?.height ?? 60;
    const viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft ?? 0;
    const topEdge = viewport?.offsetTop ?? 0;
    const maxX = leftEdge + (viewport?.width ?? window.innerWidth) - width - 8;
    const maxY = topEdge + (viewport?.height ?? window.innerHeight) - height - 8;
    return {
      x: Math.max(leftEdge + 8, Math.min(x, Math.max(leftEdge + 8, maxX))),
      y: Math.max(topEdge + 8, Math.min(y, Math.max(topEdge + 8, maxY))),
    };
  }
  // Pointer capture is acquired only after the user actually drags, so
  // ordinary taps still reach mute, disconnect and expand buttons.
  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    if (!floating || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      pointerId: event.pointerId, originX: event.clientX, originY: event.clientY,
      startX: rect.left, startY: rect.top, dragging: false,
    };
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!floating || !drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.originX;
    const deltaY = event.clientY - drag.originY;
    if (!drag.dragging) {
      if (Math.hypot(deltaX, deltaY) < 8) return;
      drag.dragging = true;
      frameRef.current?.setPointerCapture(event.pointerId);
    }
    setPosition(clamp(drag.startX + deltaX, drag.startY + deltaY));
  }
  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (frameRef.current?.hasPointerCapture(event.pointerId)) frameRef.current.releasePointerCapture(event.pointerId);
  }
  useEffect(() => {
    if (!floating) { dragRef.current = null; return; }
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
      role={floating ? 'group' : undefined}
      aria-label={floating ? (pt ? 'Chamada de voz móvel' : 'Movable voice call') : undefined}
      onPointerDown={beginDrag} onPointerMove={moveDrag}
      onPointerUp={stopDrag} onPointerCancel={stopDrag}
      className={floating
        ? 'fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-[180] w-max max-w-[calc(100vw-1.5rem)] touch-none select-none cursor-grab active:cursor-grabbing md:bottom-5 md:right-5'
        : 'fixed z-[35] min-h-0 overflow-hidden bg-background'}
      style={floating
        ? position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined
        : bounds && bounds.width > 0 && bounds.height > 0
          ? { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height }
          : { visibility: 'hidden', pointerEvents: 'none' }}>
      {children}
    </div>
  );
}
