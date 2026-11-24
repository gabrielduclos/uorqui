import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Images } from 'lucide-react'
import { api, errorText, type Attachment } from './api'
import { Button, Modal } from './components/ui/controls'
import { Skeleton } from './components/ui/skeleton'
import { ChatAudioPlayer } from './ChatAudioPlayer'
import type { Copy, Locale } from './copy'

export type GalleryMedia = Attachment & { messageId?: number; author?: string; createdAt?: string }
export const isMedia = (file: Attachment) => /^(image|video|audio)\//.test(file.mime)

export function ReadyMedia({ file, copy, locale, ready, open }: {
  file: Attachment; copy: Copy; locale: Locale; ready?: (id: string, loaded: boolean) => void; open?: () => void
}) {
  const src = file.url ?? `/api/files/${file.id}`
  const media = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const callback = useRef(ready)
  callback.current = ready
  function report(value: boolean) { setLoaded(value); callback.current?.(file.id, value) }
  useLayoutEffect(() => {
    setFailed(false)
    report(false)
    const check = () => {
      if (document.hidden) return
      const element = media.current
      if (element instanceof HTMLImageElement) report(element.complete && element.naturalWidth > 0)
      else if (element instanceof HTMLVideoElement) report(element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
    }
    check()
    document.addEventListener('visibilitychange', check)
    window.addEventListener('pageshow', check)
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('pageshow', check) }
  }, [src, attempt])
  const error = () => { setFailed(true); report(false) }
  const image = file.mime.startsWith('image/')
  return <div className={`ready-media ${image ? 'is-image' : file.mime.startsWith('audio/') ? 'is-audio' : 'is-video'} ${loaded ? 'is-loaded' : ''}`} aria-busy={!loaded && !failed}>
    {!loaded && !failed && <div className="media-placeholder" role="status" aria-label={copy.loading}><Skeleton className="media-skeleton" /></div>}
    {failed ? <div className="media-failure" role="alert"><p>{copy.mediaError}</p><Button variant="outline" onClick={() => setAttempt((v) => v + 1)}>{copy.retry}</Button></div>
      : image ? <button className="media-open" onClick={open} disabled={!open} aria-label={file.name}>
        <img key={`${src}:${attempt}`} ref={(element) => { media.current = element }} src={src} alt={file.name} loading="lazy" onLoad={() => report(true)} onError={error} />
      </button> : file.mime.startsWith('video/') ? <><video key={`${src}:${attempt}`} ref={(element) => { media.current = element }} controls playsInline preload="metadata" src={src} aria-label={file.name}
        onLoadedData={() => report(true)} onCanPlay={() => report(true)} onError={error} />
        {open && loaded && <Button variant="ghost" className="media-expand" aria-label={`${copy.gallery}: ${file.name}`} onClick={open}><Images size={16} /></Button>}</>
      : <ChatAudioPlayer key={`${src}:${attempt}`} src={src} locale={locale} onReady={(value) => report(value)} onError={error} />}
  </div>
}

function GalleryThumbnail({ file, copy }: { file: Attachment; copy: Copy }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  return <div className="gallery-thumbnail" aria-busy={!loaded && !failed}>
    {!loaded && !failed && <div className="media-placeholder" role="status" aria-label={copy.loading}><Skeleton className="media-skeleton" /></div>}
    {failed ? <Images size={28} aria-hidden="true" /> : <img src={file.url ?? `/api/files/${file.id}`} loading="lazy" alt="" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
  </div>
}

type MediaPage = { items: GalleryMedia[]; next: string | null }
export function MediaGallery({ channelId, initial, copy, locale, close }: { channelId: string; initial?: GalleryMedia; copy: Copy; locale: Locale; close: () => void }) {
  const [items, setItems] = useState<GalleryMedia[]>(initial ? [initial] : [])
  const [selected, setSelected] = useState(initial?.id)
  const viewer = useRef<HTMLDivElement>(null)
  useEffect(() => { if (selected) viewer.current?.focus() }, [selected])
  const [next, setNext] = useState<string | null>()
  const [busy, setBusy] = useState(true)
  const [failure, setFailure] = useState<unknown>()
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setBusy(true); setFailure(undefined)
    void api<MediaPage>(`/channels/${channelId}/media`, { signal: controller.signal }).then((page) => {
      if (controller.signal.aborted) return
      setItems(initial && !page.items.some((item) => item.id === initial.id) ? [initial, ...page.items] : page.items)
      setNext(page.next)
    }).catch((error) => { if (!controller.signal.aborted) setFailure(error) }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [channelId, retry])
  const index = items.findIndex((item) => item.id === selected)
  const file = items[index]
  const pageMore = async () => {
    if (!next || busy) return
    setBusy(true); setFailure(undefined)
    try {
      const page = await api<MediaPage>(`/channels/${channelId}/media?before=${encodeURIComponent(next)}`)
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))])
      setNext(page.next)
      return page.items
    } catch (error) { setFailure(error) } finally { setBusy(false) }
  }
  const previous = () => setSelected(items[index - 1]?.id)
  const following = async () => {
    if (index < items.length - 1) setSelected(items[index + 1]?.id)
    else { const more = await pageMore(); if (more?.[0]) setSelected(more[0].id) }
  }
  return <Modal title={copy.gallery} closeLabel={copy.close} onClose={close} className="gallery-modal">
    {file ? <div className="gallery-viewer" tabIndex={-1} ref={viewer} onKeyDown={(event) => {
      if ((event.target as HTMLElement).closest('video,audio,input,select')) return
      if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); previous() }
      if (event.key === 'ArrowRight') { event.preventDefault(); void following() }
    }}>
      <ReadyMedia key={file.id} file={file} copy={copy} locale={locale} />
      <p className="gallery-caption">{file.name}{file.author && ` · ${file.author}`}{file.createdAt && ` · ${new Date(file.createdAt).toLocaleString(locale)}`}</p>
      <div className="gallery-navigation"><Button variant="outline" aria-label={copy.previousMedia} disabled={index < 1} onClick={previous}><ChevronLeft size={18} /></Button>
        <Button variant="ghost" onClick={() => setSelected(undefined)}>{copy.gallery}</Button>
        <a className="file-link" href={file.url ?? `/api/files/${file.id}?download=1`} download={file.name}>{copy.download}</a>
        <Button variant="outline" aria-label={copy.nextMedia} disabled={index >= items.length - 1 && !next} loading={busy} onClick={following}><ChevronRight size={18} /></Button></div>
    </div> : <>
      <div className="gallery-grid">{items.map((item) => <button className="gallery-tile" key={item.id} onClick={() => setSelected(item.id)} aria-label={item.name}>
        {item.mime.startsWith('image/') ? <GalleryThumbnail file={item} copy={copy} /> : <Images size={28} aria-hidden="true" />}<span>{item.name}</span>
      </button>)}</div>
      {busy && <div role="status" aria-label={copy.loading}><Skeleton className="media-skeleton" /></div>}
      {!busy && !items.length && failure === undefined && <p className="muted">{copy.emptyGallery}</p>}
      {next && <Button variant="outline" loading={busy} onClick={pageMore}>{copy.moreMedia}</Button>}
    </>}
    {failure !== undefined && <div role="alert"><p className="error">{errorText(copy, failure)}</p><Button variant="outline" onClick={() => next ? pageMore() : setRetry((v) => v + 1)}>{copy.retry}</Button></div>}
  </Modal>
}
