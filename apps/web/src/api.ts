import type { Copy } from './copy'

export interface User { id: string; name: string; email: string }
export interface Team { id: string; name: string; role: 'owner' | 'member' | null }
export interface Channel { id: string; name: string; description: string; visibility: 'team' | 'private' }
export interface Message { id: number; body: string; author: string; createdAt: string; replies: number }
export interface MessagePage { messages: Message[]; more: boolean }

export class ApiError extends Error {
  constructor(readonly code: string) { super(code) }
}

export async function api<T>(path: string, options: { data?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const { data, signal } = options
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
  const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : undefined
  if (response.status === 401 && code === 'SIGN_IN_REQUIRED') {
    window.dispatchEvent(new Event('session-expired'))
  }
  if (!response.ok || body === null) throw new ApiError(code ?? 'API_UNAVAILABLE')
  return body as T
}

export function errorText(copy: Copy, error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'SERVER_ERROR'
  return Object.hasOwn(copy.errors, code) ? copy.errors[code as keyof Copy['errors']] : copy.errors.SERVER_ERROR
}
