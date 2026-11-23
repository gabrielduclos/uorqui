import { useCallback, useSyncExternalStore } from 'react'
import type { Message } from './api'

const entries = new Map<string, Message[]>()
const empty: Message[] = []
let generation = 0
const notify = () => window.dispatchEvent(new Event('outbox-updated'))

function revoke(messages: Message[]) {
  for (const message of messages) for (const file of message.attachments ?? []) if (file.url?.startsWith('blob:')) URL.revokeObjectURL(file.url)
}

export function clearOutbox() {
  generation++
  for (const items of entries.values()) revoke(items)
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
    const previous = entries.get(key) ?? empty
    const next = change(previous)
    const retained = new Set(next.flatMap((message) => (message.attachments ?? []).map((file) => file.url)))
    revoke(previous.map((message) => ({ ...message, attachments: message.attachments?.filter((file) => !retained.has(file.url)) })))
    if (next.length) entries.set(key, next)
    else entries.delete(key)
    notify()
  }, [key, version])
  return [messages, update] as const
}
