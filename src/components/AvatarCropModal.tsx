import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { LoaderCircle, Move, ZoomIn } from "lucide-react";
import { Modal } from "./Modal";

type Point = { x: number; y: number };

export function AvatarCropModal({
  file,
  busy,
  onCancel,
  onConfirm,
}: {
  file: File;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void> | void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerId: number; origin: Point; offset: Point } | null>(null);
  const [source, setSource] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [preparing, setPreparing] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSource(url);
    setImageSize({ width: 0, height: 0 });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setPreparing(true);
    setError("");
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const frameSize = () => frameRef.current?.getBoundingClientRect().width || 280;

  const dimensionsAt = (nextZoom: number) => {
    const size = frameSize();
    if (!imageSize.width || !imageSize.height) return { size, scale: 1, width: size, height: size };
    const baseScale = Math.max(size / imageSize.width, size / imageSize.height);
    const scale = baseScale * nextZoom;
    return {
      size,
      scale,
      width: imageSize.width * scale,
      height: imageSize.height * scale,
    };
  };

  const clampOffset = (point: Point, nextZoom = zoom) => {
    const dimensions = dimensionsAt(nextZoom);
    const maxX = Math.max(0, (dimensions.width - dimensions.size) / 2);
    const maxY = Math.max(0, (dimensions.height - dimensions.size) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, point.x)),
      y: Math.max(-maxY, Math.min(maxY, point.y)),
    };
  };

  const updateZoom = (value: number) => {
    const nextZoom = Math.max(1, Math.min(3, value));
    setZoom(nextZoom);
    setOffset((current) => clampOffset(current, nextZoom));
  };

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy || preparing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      offset,
    };
  };

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    setOffset(clampOffset({
      x: active.offset.x + event.clientX - active.origin.x,
      y: active.offset.y + event.clientY - active.origin.y,
    }));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const createCroppedFile = async () => {
    const image = imageRef.current;
    if (!image || !imageSize.width || !imageSize.height) throw new Error("A foto ainda não terminou de carregar.");

    const dimensions = dimensionsAt(zoom);
    const renderedLeft = dimensions.size / 2 - dimensions.width / 2 + offset.x;
    const renderedTop = dimensions.size / 2 - dimensions.height / 2 + offset.y;
    const sourceX = Math.max(0, -renderedLeft / dimensions.scale);
    const sourceY = Math.max(0, -renderedTop / dimensions.scale);
    const sourceSize = Math.min(
      dimensions.size / dimensions.scale,
      imageSize.width - sourceX,
      imageSize.height - sourceY
    );

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Este navegador não conseguiu preparar a foto.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 512, 512);
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("Não foi possível processar a foto.")),
        "image/jpeg",
        0.9
      );
    });
    const originalName = file.name.replace(/\.[^.]+$/, "") || "foto-perfil";
    return new File([blob], `${originalName}-uorqui.jpg`, { type: "image/jpeg" });
  };

  const confirmCrop = async () => {
    if (busy || preparing) return;
    setError("");
    try {
      await onConfirm(await createCroppedFile());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Não foi possível preparar a foto.");
    }
  };

  const dimensions = dimensionsAt(zoom);

  return (
    <Modal title="Enquadrar foto de perfil" onClose={() => !busy && onCancel()}>
      <div className={`avatar-crop-editor ${busy ? "busy" : ""}`} aria-busy={busy || preparing}>
        <div
          ref={frameRef}
          className="avatar-crop-frame"
          onPointerDown={beginDrag}
          onPointerMove={drag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {source && (
            <img
              ref={imageRef}
              src={source}
              alt="Prévia da foto de perfil"
              draggable={false}
              style={imageSize.width ? {
                width: dimensions.width,
                height: dimensions.height,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              } : undefined}
              onLoad={(event) => {
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
                setPreparing(false);
              }}
              onError={() => {
                setPreparing(false);
                setError("Não foi possível abrir esta imagem.");
              }}
            />
          )}
          <div className="avatar-crop-mask" aria-hidden="true" />
          {preparing && (
            <div className="avatar-crop-loading"><LoaderCircle size={24} /> Preparando foto…</div>
          )}
        </div>

        <p className="avatar-crop-hint"><Move size={15} /> Arraste a foto para escolher o enquadramento.</p>
        <label className="avatar-crop-zoom">
          <ZoomIn size={16} />
          <span>Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            disabled={busy || preparing}
            onChange={(event) => updateZoom(Number(event.target.value))}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions avatar-crop-actions">
          <button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn" disabled={busy || preparing} onClick={confirmCrop}>
            {busy ? <><LoaderCircle className="spin" size={16} /> Salvando…</> : "Usar esta foto"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
