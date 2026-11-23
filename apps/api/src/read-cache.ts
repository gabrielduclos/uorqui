interface Entry {
  pending: Promise<unknown>
  expiresAt: number
}

export class ReadCache {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly ttlMs = 5000, private readonly limit = 100) {}

  clear(prefix: string) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key)
    }
  }

  read<T>(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const cached = this.entries.get(key)
    if (cached && cached.expiresAt > now) return cached.pending as Promise<T>
    const entry: Entry = { pending: Promise.resolve(), expiresAt: now + this.ttlMs }
    entry.pending = load().then((value) => {
      if (this.entries.get(key) === entry) entry.expiresAt = Date.now() + this.ttlMs
      return value
    }).catch((error) => {
      if (this.entries.get(key) === entry) this.entries.delete(key)
      throw error
    })
    this.entries.delete(key)
    this.entries.set(key, entry)
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!)
    return entry.pending as Promise<T>
  }
}
