import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import type { Pool } from 'pg'
import { createRealtime } from '../src/realtime.js'

test('realtime relays database notifications, isolates channels and avoids duplicate local delivery', async () => {
  const clients = new Set<EventEmitter>()
  const pool = {
    async connect() {
      const client = Object.assign(new EventEmitter(), {
        async query() {}, release() { clients.delete(client) },
      })
      clients.add(client)
      return client
    },
    async query(_sql: string, args: string[]) {
      for (const client of clients) client.emit('notification', { channel: args[0], payload: args[1] })
    },
  } as unknown as Pool
  const invalidated: string[] = []
  const first = createRealtime(pool, (id) => invalidated.push(`first:${id}`))
  const second = createRealtime(pool, (id) => invalidated.push(`second:${id}`))
  let a = 0, b = 0, hidden = 0
  const inbox: Array<string | undefined> = []
  second.subscribe('*', (channelId) => inbox.push(channelId))
  const unsubscribe = first.subscribe('visible', () => a++)
  second.subscribe('visible', () => b++)
  second.subscribe('private', () => hidden++)
  await Promise.all([first.start(), second.start()])
  await new Promise<void>((resolve) => setImmediate(resolve))
  a = b = hidden = 0; invalidated.length = 0
  inbox.length = 0
  await first.publish('visible')
  assert.deepEqual({ a, b, hidden }, { a: 1, b: 1, hidden: 0 })
  assert.deepEqual(inbox, ['visible'])
  assert.deepEqual(invalidated, ['first:visible', 'second:visible'])
  unsubscribe()
  await second.publish('visible')
  assert.deepEqual({ a, b, hidden }, { a: 1, b: 2, hidden: 0 })
  for (const client of clients) client.emit('notification', { channel: 'uorqui_workplace_messages', payload: '{malformed' })
  assert.equal(b, 2)
  await Promise.all([first.close(), second.close()])
  assert.equal(clients.size, 0)
})
