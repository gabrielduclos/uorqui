interface Entry {
  value?: unknown
  freshUntil: number
  retainedUntil: number
  pending?: Promise<unknown>
}

// Entries live only in this tab and are discarded at authentication boundaries.
const entries = new Map<string, Entry>()
const retention = 5 * 60_000
const limit = 100

export function invalidateQueries(prefix = '') {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key)
  }
}

export function cachedQuery<T>(key: string): T | undefined {
  const entry = entries.get(key)
  if (!entry || entry.retainedUntil <= Date.now()) {
    entries.delete(key)
    return undefined
  }
  return entry.value as T | undefined
}

export function readQuery<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const existing = entries.get(key)
  if (existing?.pending) return existing.pending as Promise<T>
  if (existing?.value !== undefined && existing.freshUntil > now) {
    entries.delete(key)
    entries.set(key, existing)
    return Promise.resolve(existing.value as T)
  }

  const entry: Entry = { value: cachedQuery<T>(key), freshUntil: 0, retainedUntil: now + retention }
  const pending = load().then((value) => {
    if (entries.get(key) === entry) {
      entry.value = value
      entry.freshUntil = Date.now() + ttl
      entry.retainedUntil = Date.now() + retention
    }
    return value
  }).finally(() => {
    if (entries.get(key) === entry) entry.pending = undefined
  })
  entry.pending = pending
  entries.delete(key)
  entries.set(key, entry)
  while (entries.size > limit) entries.delete(entries.keys().next().value!)
  return pending
}

export function waitForQuery<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'))
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
