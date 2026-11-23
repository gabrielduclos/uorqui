import { useEffect } from 'react'
import { refreshChannel } from './api'

const connected = new Set<string>()
export const isRealtimeConnected = (channelId: string) => connected.has(channelId)

export function useRealtime(channelId: string) {
  useEffect(() => {
    let stream: EventSource | undefined
    const stop = () => { stream?.close(); stream = undefined; connected.delete(channelId) }
    const start = () => {
      if (document.hidden || stream) return
      stream = new EventSource(`/api/channels/${channelId}/events`)
      stream.addEventListener('ready', () => { connected.add(channelId); refreshChannel(channelId) })
      stream.addEventListener('messages', () => refreshChannel(channelId))
      stream.addEventListener('access-revoked', () => { stop(); refreshChannel(channelId) })
      stream.onerror = () => { connected.delete(channelId) }
    }
    const visibility = () => { if (document.hidden) stop(); else start() }
    document.addEventListener('visibilitychange', visibility)
    start()
    return () => { stop(); document.removeEventListener('visibilitychange', visibility) }
  }, [channelId])
}
