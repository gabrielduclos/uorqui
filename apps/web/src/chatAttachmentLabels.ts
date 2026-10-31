/** Human-facing attachment names; never expose camera filenames or storage IDs in chat UI. */
export function attachmentLabel(mime: string | null | undefined, locale: string): string {
  const pt=locale==='pt-BR';
  if(mime?.startsWith('image/'))return pt?'Foto':'Photo';
  if(mime?.startsWith('video/'))return pt?'Vídeo':'Video';
  if(mime?.startsWith('audio/'))return pt?'Áudio':'Audio';
  if(mime==='application/pdf')return pt?'Documento PDF':'PDF document';
  if(mime==='application/zip')return pt?'Arquivo compactado':'Archive';
  if(mime==='text/plain')return pt?'Documento de texto':'Text document';
  return pt?'Arquivo':'File';
}
