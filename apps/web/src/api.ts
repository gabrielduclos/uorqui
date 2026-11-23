import { clearOutbox } from './outbox'
import { cachedQuery, invalidateQueries, readQuery, waitForQuery } from './query-cache'
import type { Copy } from './copy'

export interface PublicProfile { id: string; name: string; handle: string | null; bio: string | null }
export interface Member extends PublicProfile { role: 'owner' | 'member' | 'guest' }
export interface DirectChannel extends Channel { peerId: string }
export interface User { handle?: string | null; bio?: string | null; id: string; name: string; email: string }
export interface Team { id: string; name: string; role: 'owner' | 'member' | null }
export interface Channel { id: string; name: string; description: string; visibility: 'team' | 'private' }
export interface Attachment { id: string; name: string; mime: string; size: number; url?: string }
export interface Message { attachments?: Attachment[]; location?: { latitude: number; longitude: number } | null; pendingFile?: File; clientId?: string | null; authorId?: string; editedAt?: string | null; cancelledAt?: string | null; delivery?: 'sending' | 'failed'; id: number; body: string; author: string; createdAt: string; replies: number }
export interface MessagePage { messages: Message[]; more: boolean }

export class ApiError extends Error {
  constructor(readonly code: string) { super(code) }
}

let authGeneration = 0
let dataGeneration = 0

const isPublicProfile = (path: string) => path.startsWith('/profiles/')

async function request<T>(path: string, options: { data?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const { data, signal } = options
  const generation = authGeneration
  let response
  try {
    response = await fetch(`/api${path}`, {
      signal,
      ...(data !== undefined ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      } : {}),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError('API_UNAVAILABLE')
  }
  const body = await response.json().catch(() => null)
  if (data === undefined && !isPublicProfile(path) && generation !== authGeneration) throw new DOMException('Session changed', 'AbortError')
  const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : undefined
  if (response.status === 401 && code === 'SIGN_IN_REQUIRED') {
    invalidateQueries()
    clearOutbox()
    window.dispatchEvent(new Event('session-expired'))
  }
  if (response.status === 403 || response.status === 404) {
    invalidateQueries(path.split('?')[0])
  }
  if (!response.ok || body === null) throw new ApiError(code ?? 'API_UNAVAILABLE')
  return body as T
}

export { cachedQuery }

export function refreshChannel(channelId: string) {
  dataGeneration++
  invalidateQueries(`/channels/${channelId}/messages`)
  window.dispatchEvent(new Event('cache-updated'))
}

const updates = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('uorqui-workplace-cache')
updates?.addEventListener('message', (event) => {
  dataGeneration++
  invalidateQueries()
  if (event.data === 'auth') { clearOutbox(); authGeneration++; window.dispatchEvent(new Event('session-expired')) }
  else window.dispatchEvent(new Event('cache-updated'))
})

export async function api<T>(path: string, options: { data?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  if (options.data !== undefined) {
    const result = await request<T>(path, options)
    dataGeneration++
    if (path.startsWith('/auth/')) { clearOutbox(); authGeneration++; invalidateQueries() }
    else if (path.includes('/messages')) invalidateQueries(path.split('/messages')[0] + '/messages')
    else if (path === '/profile') {
      invalidateQueries('/profile')
      invalidateQueries('/people')
      invalidateQueries('/session')
      invalidateQueries('/direct')
      invalidateQueries('/channels')
      invalidateQueries('/teams')
    } else if (path === '/direct') invalidateQueries('/direct')
    else { invalidateQueries('/teams'); invalidateQueries('/channels') }
    updates?.postMessage(path.startsWith('/auth/') ? 'auth' : 'data')
    if (!path.startsWith('/auth/')) window.dispatchEvent(new Event('cache-updated'))
    return result
  }
  // Session responses always reach the API. Other data can be reused within this tab.
  const ttl = path === '/session' ? 0 : path.includes('before=') ? 300_000 : path.includes('/messages') ? 8000 : 60_000
  const generation = dataGeneration
  const identity = authGeneration
  const result = await waitForQuery(readQuery(path, ttl, () => request<T>(path)), options.signal)
  if (!isPublicProfile(path) && identity !== authGeneration) throw new DOMException('Session changed', 'AbortError')
  if (generation !== dataGeneration) return api<T>(path, options)
  return result
}

export function errorText(copy: Copy, error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'SERVER_ERROR'
  return Object.hasOwn(copy.errors, code) ? copy.errors[code as keyof Copy['errors']] : copy.errors.SERVER_ERROR
}
