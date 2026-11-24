import { useState } from 'react'
import { ApiError, api, errorText, refreshPhotos } from './api'
import type { Copy } from './copy'
import { Button } from './components/ui/controls'
import { optimizeAvatar } from './imageCompression'

export function Avatar({ name, src, className = '' }: { name: string; src?: string | null; className?: string }) {
  const [failed, setFailed] = useState<string>()
  const letters = name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]?.toUpperCase()).join('')
  return <span className={`avatar ${className}`} aria-hidden="true">{src && failed !== src
    ? <img src={src} alt="" onError={() => setFailed(src)} /> : letters}</span>
}

export function PhotoSettings({ name, src, teamId, copy, saved }: {
  name: string; src?: string | null; teamId?: string; copy: Copy; saved: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [image, setImage] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<unknown>()
  return <div className="photo-settings">
    <Avatar name={name} src={image === undefined ? src : image} />
    <label className="photo-upload">{copy.changePhoto}
      <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy} aria-label={copy.changePhoto}
        onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = ''
          if (!file || busy) return
          setBusy(true); setError(undefined)
          try {
            const compact = await optimizeAvatar(file)
            const id = crypto.randomUUID()
            await api('/avatars/uploads', { data: { id, teamId, mime: compact.type, size: compact.size } })
            const uploaded = await fetch(`/api/avatars/${id}`, { method: 'PUT', body: compact })
            if (!uploaded.ok) throw new Error('UPLOAD_FAILED')
            refreshPhotos()
            setImage(`/api/avatars/${id}`)
            await saved()
          } catch (failure) { setError(failure instanceof ApiError ? failure : new ApiError('INVALID_PHOTO')) } finally { setBusy(false) }
        }} />
    </label>
    <Button variant="outline" loading={busy} disabled={busy || !(image === undefined ? src : image)} onClick={async () => {
      setBusy(true); setError(undefined)
      try { await api('/avatars/remove', { data: { teamId } }); setImage(null); await saved() } catch (failure) { setError(failure) } finally { setBusy(false) }
    }}>{copy.removePhoto}</Button>
    {busy && <p role="status">{copy.preparingPhoto}</p>}
    {error !== undefined && <p className="error" role="alert">{errorText(copy, error)}</p>}
  </div>
}
