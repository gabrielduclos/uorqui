import { useEffect, useState } from 'react'
import { api, cachedQuery } from './api'

export function useResource<T>(path: string) {
  const [data, setData] = useState<T | undefined>(() => cachedQuery<T>(path))
  const [error, setError] = useState<unknown>()
  const [attempt, setAttempt] = useState(0)
  const [retrying, setRetrying] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let timer: number
    let pending = false
    let queued = false
    async function load() {
      if (controller.signal.aborted || document.hidden) return
      if (pending) { queued = true; return }
      window.clearTimeout(timer)
      pending = true
      try {
        const result = await api<T>(path, { signal: controller.signal })
        if (!controller.signal.aborted) { setData(result); setError(undefined) }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure)
      } finally {
        pending = false
        if (!controller.signal.aborted) {
          setRetrying(false)
          if (queued) { queued = false; void load() }
          else timer = window.setTimeout(load, 60_000)
        }
      }
    }
    const update = () => { void load() }
    window.addEventListener('cache-updated', update)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    void load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
      window.removeEventListener('cache-updated', update)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [path, attempt])
  return { data, error, retrying, retry: () => { setRetrying(true); setAttempt((current) => current + 1) } }
}
