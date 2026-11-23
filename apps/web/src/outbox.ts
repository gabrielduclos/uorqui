import { useCallback, useSyncExternalStore } from 'react'
import type { Message } from './api'

const entries = new Map<string, Message[]>()
const empty: Message[] = []
let generation = 0
const notify = () => window.dispatchEvent(new Event('outbox-updated'))

export function clearOutbox() {
  generation++
  entries.clear()
  notify()
}

export function useOutbox(userId: string | undefined, channelId: string, threadId?: number) {
  const key = JSON.stringify([userId, channelId, threadId])
  const version = generation
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener('outbox-updated', listener)
    return () => window.removeEventListener('outbox-updated', listener)
  }, [])
  const snapshot = useCallback(() => entries.get(key) ?? empty, [key])
  const messages = useSyncExternalStore(subscribe, snapshot)
  const update = useCallback((change: (current: Message[]) => Message[]) => {
    if (version !== generation) return
    const next = change(entries.get(key) ?? empty)
    if (next.length) entries.set(key, next)
    else entries.delete(key)
    notify()
  }, [key, version])
  return [messages, update] as const
}
