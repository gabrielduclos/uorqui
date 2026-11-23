import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { Pool, PoolClient } from 'pg'

// Notifications carry invalidations only. Each stream checks access before delivery.
export function createRealtime(pool: Pool, invalidate: (channelId: string) => void, listenerPool: Pool = pool) {
  const emitter = new EventEmitter()
  emitter.setMaxListeners(0)
  const source = randomUUID()
  let listener: PoolClient | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let connecting = false
  const deliver = (channelId: string) => { invalidate(channelId); emitter.emit(channelId) }
  async function start() {
    if (stopped || connecting || listener) return
    connecting = true
    let client: PoolClient | undefined
    try {
      client = await listenerPool.connect()
      if (stopped || !emitter.eventNames().length) { client.release(true); return }
      listener = client
      client.on('notification', (message) => {
        if (message.channel !== 'uorqui_workplace_messages') return
        try {
          const event = JSON.parse(message.payload ?? '')
          if (event.source !== source && typeof event.channelId === 'string') deliver(event.channelId)
        } catch { /* Ignore malformed notifications. */ }
      })
      client.once('error', () => {
        if (listener !== client) return
        listener = undefined
        client?.release(true)
        if (!stopped && emitter.eventNames().length) retry = setTimeout(() => void start(), 3000)
      })
      await client.query('LISTEN uorqui_workplace_messages')
      for (const channelId of emitter.eventNames()) if (typeof channelId === 'string') deliver(channelId)
    } catch {
      if (listener === client) { listener = undefined; client?.release(true) }
      if (!stopped && emitter.eventNames().length) retry = setTimeout(() => void start(), 3000)
    } finally { connecting = false }
  }
  return {
    start,
    subscribe(channelId: string, callback: () => void) {
      emitter.on(channelId, callback)
      void start()
      return () => {
        emitter.off(channelId, callback)
        if (!emitter.eventNames().length) {
          clearTimeout(retry)
          if (listener) { const current = listener; listener = undefined; current.release(true) }
        }
      }
    },
    async publish(channelId: string) {
      deliver(channelId)
      try { await pool.query('select pg_notify($1, $2)', ['uorqui_workplace_messages', JSON.stringify({ channelId, source })]) }
      catch { /* Local delivery remains available during a database listener outage. */ }
    },
    async close() {
      stopped = true
      clearTimeout(retry)
      if (listener) { const current = listener; listener = undefined; current.release(true) }
      emitter.removeAllListeners()
    },
  }
}
