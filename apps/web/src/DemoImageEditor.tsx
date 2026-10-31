import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowUpRight, Check, Circle, Pencil, RotateCcw, Square, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Tool = 'pen' | 'rectangle' | 'ellipse' | 'arrow';
type Point = { x: number; y: number };
type Mark = { tool: Tool; color: string; points: Point[] };
const COLORS = ['#ff4646', '#ffb32c', '#2ccf83', '#32a9ff', '#ffffff', '#111111'] as const;
const MAX_DIMENSION = 1800;

function drawMark(ctx: CanvasRenderingContext2D, mark: Mark, width: number) {
  const [first, last] = [mark.points[0], mark.points[mark.points.length - 1]];
  if (!first || !last) return;
  ctx.beginPath();
  ctx.strokeStyle = mark.color;
  ctx.lineWidth = Math.max(3, width / 260);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (mark.tool === 'pen') {
    ctx.moveTo(first.x, first.y);
    for (const point of mark.points.slice(1)) ctx.lineTo(point.x, point.y);
    if (mark.points.length === 1) ctx.lineTo(first.x + 0.01, first.y);
  } else if (mark.tool === 'rectangle') {
    ctx.rect(first.x, first.y, last.x - first.x, last.y - first.y);
  } else if (mark.tool === 'ellipse') {
    const radiusX = Math.abs(last.x - first.x) / 2;
    const radiusY = Math.abs(last.y - first.y) / 2;
    if (radiusX > 0 && radiusY > 0) {
      ctx.ellipse((first.x + last.x) / 2, (first.y + last.y) / 2, radiusX, radiusY, 0, 0, Math.PI * 2);
    }
  } else {
    const angle = Math.atan2(last.y - first.y, last.x - first.x);
    const head = Math.max(14, width / 45);
    ctx.moveTo(first.x, first.y);
    ctx.lineTo(last.x, last.y);
    ctx.moveTo(last.x - head * Math.cos(angle - Math.PI / 6), last.y - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(last.x, last.y);
    ctx.lineTo(last.x - head * Math.cos(angle + Math.PI / 6), last.y - head * Math.sin(angle + Math.PI / 6));
  }
  ctx.stroke();
}

/** Non-destructive canvas markup; saves a new local PNG only when the user confirms. */
export function DemoImageEditor({ src, onCancel, onSave }: {
  src: string;
  onCancel: () => void;
  onSave: (image: Blob) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sourceImage = useRef<HTMLImageElement | null>(null);
  const activeMark = useRef<Mark | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [working, setWorking] = useState<Mark | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const render = useCallback((drawn: Mark[], pending: Mark | null) => {
    const el = canvas.current, img = sourceImage.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !img) return;
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(img, 0, 0, el.width, el.height);
    for (const mark of drawn) drawMark(ctx, mark, el.width);
    if (pending) drawMark(ctx, pending, el.width);
  }, []);

  useEffect(() => {
    let active = true;
    const img = new Image();
    setReady(false);
    setMarks([]);
    setWorking(null);
    activeMark.current = null;
    img.onload = () => {
      if (!active || !canvas.current) return;
      const naturalWidth = img.naturalWidth, naturalHeight = img.naturalHeight;
      if (!naturalWidth || !naturalHeight) { setError('Não foi possível abrir esta foto.'); return; }
      const scale = Math.min(1, MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
      canvas.current.width = Math.max(1, Math.round(naturalWidth * scale));
      canvas.current.height = Math.max(1, Math.round(naturalHeight * scale));
      sourceImage.current = img;
      setReady(true);
      setError('');
      const context = canvas.current.getContext('2d');
      context?.drawImage(img, 0, 0, canvas.current.width, canvas.current.height);
    };
    img.onerror = () => { if (active) setError('Não foi possível abrir esta foto para edição.'); };
    img.src = src;
    return () => { active = false; img.onload = null; img.onerror = null; sourceImage.current = null; };
  }, [src]);

  useEffect(() => { if (ready) render(marks, working); }, [marks, working, ready, render]);

  function position(event: PointerEvent<HTMLCanvasElement>): Point {
    const element = canvas.current!;
    const box = element.getBoundingClientRect();
    return {
      x: Math.min(element.width, Math.max(0, (event.clientX - box.left) * element.width / box.width)),
      y: Math.min(element.height, Math.max(0, (event.clientY - box.top) * element.height / box.height)),
    };
  }
  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (!ready || saving) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = position(event);
    const mark = { tool, color, points: [point] };
    activeMark.current = mark;
    setWorking(mark);
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    const mark = activeMark.current;
    if (!mark) return;
    event.preventDefault();
    const point = position(event);
    const next = { ...mark, points: mark.tool === 'pen' ? [...mark.points, point] : [mark.points[0], point] };
    activeMark.current = next;
    setWorking(next);
  }
  function stop(event: PointerEvent<HTMLCanvasElement>) {
    const mark = activeMark.current;
    if (!mark) return;
    event.preventDefault();
    activeMark.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setMarks(previous => [...previous, mark]);
    setWorking(null);
  }

  function undo() {
    activeMark.current = null;
    setWorking(null);
    setMarks(previous => previous.slice(0, -1));
  }

  function save() {
    if (!canvas.current || !ready || saving) return;
    setSaving(true);
    setError('');
    render(marks, null);
    canvas.current.toBlob(blob => {
      if (!blob) { setSaving(false); setError('Não foi possível salvar a edição.'); return; }
      onSave(blob);
      setSaving(false);
    }, 'image/png');
  }

  const tools = [
    { id: 'pen' as Tool, Icon: Pencil, label: 'Desenhar à mão livre' },
    { id: 'rectangle' as Tool, Icon: Square, label: 'Retângulo' },
    { id: 'ellipse' as Tool, Icon: Circle, label: 'Círculo' },
    { id: 'arrow' as Tool, Icon: ArrowUpRight, label: 'Seta' },
  ];

  return <section aria-label="Editor de foto" className="flex min-h-0 flex-1 flex-col gap-3 py-3">
    <div className="flex flex-wrap items-center gap-2">
      {tools.map(item => <Button key={item.id} type="button" size="sm" variant={tool === item.id ? 'default' : 'outline'} aria-label={item.label} aria-pressed={tool === item.id} onClick={() => setTool(item.id)} className="size-10 shrink-0 rounded-none p-0"><item.Icon className="size-4" /></Button>)}
      <span className="mx-1 h-7 w-px bg-white/25" />
      {COLORS.map(item => <button key={item} type="button" aria-label={'Cor ' + item} aria-pressed={color === item} title={item} onClick={() => setColor(item)} className="size-7 shrink-0 rounded-full border-2 border-white/50 outline-offset-2 focus-visible:outline-2 focus-visible:outline-white" style={{ backgroundColor: item, outline: color === item ? '2px solid white' : undefined }} />)}
      <span className="flex-1" />
      <Button type="button" variant="outline" size="sm" onClick={undo} disabled={!marks.length || saving}><Undo2 className="size-4" />Desfazer</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => { setMarks([]); setWorking(null); }} disabled={!marks.length || saving}><RotateCcw className="size-4" />Limpar</Button>
    </div>
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/40">
      <canvas ref={canvas} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} style={{ touchAction: 'none', maxHeight: '65dvh', maxWidth: '100%', width: 'auto', height: 'auto', cursor: 'crosshair' }} aria-label="Área de desenho sobre a foto" />
    </div>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    <div className="flex shrink-0 justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={saving}><X className="size-4" />Cancelar</Button>
      <Button type="button" onClick={save} disabled={!ready || saving}><Check className="size-4" />{saving ? 'Salvando…' : 'Salvar edição'}</Button>
    </div>
    <p className="text-center text-xs text-white/60">Desenhe com o mouse ou toque; a foto original só é substituída após salvar nesta prévia.</p>
  </section>;
}
