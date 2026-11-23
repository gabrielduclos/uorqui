/**
 * Compact photographic attachments on the device before upload.
 * This is intentionally opt-in from the gallery/camera/paste composer paths:
 * sending as "File" retains the original byte-for-byte.
 */
const SUPPORTED_PHOTOS = new Set(['image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const MIN_BYTES = 300 * 1024;
const MAX_EDGE = 2048;
const WEBP_QUALITY = 0.85;
const MIN_SAVING = 0.10;

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('ABORTED');
}

export async function optimizeImageAttachment(file: File, signal?: AbortSignal): Promise<File> {
  assertNotAborted(signal);
  // PNGs (often screenshots and text) are retained without lossy re-encoding.
  // GIFs, including animated GIFs, must also remain untouched.
  if (!SUPPORTED_PHOTOS.has(file.type) || file.size < MIN_BYTES ||
      typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    assertNotAborted(signal);
    if (!bitmap.width || !bitmap.height) return file;

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    assertNotAborted(signal);
    const optimized = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
    assertNotAborted(signal);
    // WebP is not always supported by the canvas encoder (notably older browsers).
    // Keep the source whenever conversion would save too little or add bytes.
    if (!optimized || optimized.type !== 'image/webp' ||
        optimized.size >= file.size * (1 - MIN_SAVING)) return file;
    const base = (file.name.replace(/\.[^.]+$/, '') || 'foto').slice(0, 174);
    return new File([optimized], base + '.webp', {
      type: 'image/webp', lastModified: file.lastModified,
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.message === 'ABORTED')) {
      throw new Error('ABORTED');
    }
    // Decoding and encoding are browser-dependent, especially for HEIC/HEIF.
    // Image optimization must never make an otherwise valid upload fail.
    return file;
  } finally {
    bitmap?.close();
  }
}
