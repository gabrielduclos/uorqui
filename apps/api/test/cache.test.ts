import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ReadCache } from '../src/read-cache.js'
import { cachedQuery, invalidateQueries, readQuery, waitForQuery } from '../../web/src/query-cache.ts'

test('cache reuses reads, coalesces callers and invalidates completed and pending data', async () => {
  const cache = new ReadCache()
  let reads = 0
  const load = async () => ++reads
  assert.deepEqual(await Promise.all([cache.read('channel:1', load), cache.read('channel:1', load)]), [1, 1])
  assert.equal(await cache.read('channel:1', load), 1)
  cache.clear('channel:')
  assert.equal(await cache.read('channel:1', load), 2)

  let finish!: (value: number) => void
  const old = cache.read('channel:pending', () => new Promise<number>((resolve) => { finish = resolve }))
  cache.clear('channel:')
  finish(7)
  await old
  assert.equal(await cache.read('channel:pending', load), 3)

  await assert.rejects(cache.read('failure', async () => { throw new Error('Unavailable') }))
  assert.equal(await cache.read('failure', load), 4)
})

test('browser cache clears across authentication and keeps other callers alive after abort', async () => {
  invalidateQueries()
  let finish!: (value: string) => void
  let reads = 0
  const load = () => { reads++; return new Promise<string>((resolve) => { finish = resolve }) }
  const first = readQuery('/teams', 60_000, load)
  const second = readQuery('/teams', 60_000, load)
  const controller = new AbortController()
  const cancelled = waitForQuery(first, controller.signal)
  controller.abort()
  await assert.rejects(cancelled, { name: 'AbortError' })
  finish('user A')
  assert.equal(await second, 'user A')
  assert.equal(reads, 1)
  assert.equal(cachedQuery('/teams'), 'user A')
  assert.equal(await readQuery('/teams', 60_000, async () => 'unused'), 'user A')

  invalidateQueries()
  assert.equal(cachedQuery('/teams'), undefined)
  assert.equal(await readQuery('/teams', 60_000, async () => 'user B'), 'user B')
  invalidateQueries()
})

test('browser cache limits retained data and retries failed reads', async () => {
  invalidateQueries()
  for (let i = 0; i < 110; i++) await readQuery(String(i), 60_000, async () => i)
  assert.equal(cachedQuery('0'), undefined)
  assert.equal(cachedQuery('109'), 109)
  await assert.rejects(readQuery('failed', 5000, async () => { throw new Error('offline') }))
  assert.equal(await readQuery('failed', 5000, async () => 'reconnected'), 'reconnected')
  invalidateQueries()
})
