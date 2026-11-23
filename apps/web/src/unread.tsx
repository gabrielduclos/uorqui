import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { refreshUnread } from './api'
import type { Copy } from './copy'
import { useResource } from './use-resource'

interface Unread { channelId: string; teamId: string | null; count: number; latestId: number }
const Context = createContext<Unread[]>([])
export const useUnread = () => useContext(Context)

export function UnreadProvider({ children }: { children: ReactNode }) {
  const resource = useResource<Unread[]>('/unread')
  useEffect(() => {
    let stream: EventSource | undefined
    let connected = false
    const stop = () => { stream?.close(); stream = undefined; connected = false }
    const start = () => {
      if (document.hidden || stream) return
      stream = new EventSource('/api/inbox/events')
      stream.addEventListener('ready', () => { connected = true; refreshUnread(true) })
      stream.addEventListener('unread', (event) => {
        let direct = false
        try { direct = JSON.parse(event.data).direct === true } catch { /* Refresh counts for older server events. */ }
        refreshUnread(direct)
      })
      stream.addEventListener('access-revoked', () => { stop(); window.dispatchEvent(new Event('session-expired')) })
      stream.onerror = () => { connected = false }
    }
    const resume = () => { if (document.hidden) stop(); else start() }
    const fallback = window.setInterval(() => { if (!document.hidden && !connected) refreshUnread(true) }, 30_000)
    document.addEventListener('visibilitychange', resume)
    start()
    return () => { stop(); clearInterval(fallback); document.removeEventListener('visibilitychange', resume) }
  }, [])
  return <Context.Provider value={resource.data ?? []}>{children}</Context.Provider>
}

export function UnreadBadge({ count, copy }: { count: number; copy: Copy }) {
  return count > 0 ? <span className="unread-badge" aria-label={copy.unreadCount(count)}>{count > 99 ? '99+' : count}</span> : null
}
