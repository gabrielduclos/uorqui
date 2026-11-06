/** Same-origin JSON transport for the Uorqui workspace.
 * No in-memory response caching: private data is handled by each feature's
 * authorization-aware cache. Retain established error contracts per module.
 */
type ErrorMode = 'server-code' | 'status-code';

async function requestJson<T>(path: string, options: RequestInit | undefined, mode: ErrorMode): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
  });
  if (!response.ok) {
    if (mode === 'status-code') {
      if (response.status === 401) throw new Error('UNAUTHORIZED');
      throw new Error('HTTP_' + response.status);
    }
    const detail = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(detail?.error ?? 'HTTP_' + response.status);
  }
  // Community and moderation commands explicitly support 204; the direct
  // messaging helper preserves its original JSON-only response contract.
  if (mode === 'server-code' && response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Community and moderation endpoints return domain-specific error codes. */
export function apiRequest<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  return requestJson<T>(path, options, 'server-code');
}

/** Direct messages deliberately expose a stable UNAUTHORIZED / HTTP_n code. */
export function directApiRequest<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  return requestJson<T>(path, options, 'status-code');
}
