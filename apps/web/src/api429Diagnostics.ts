/**
 * Lightweight in-tab diagnostic for 429 responses from any same-origin API.
 * No request body, URL query, cookies, account details or IP addresses are
 * retained. Unlike /me-only counters, it also detects 429 from the edge.
 */
export type RateLimitEvent = {
  time: string;
  route: string;
  origin: 'render-upstream' | 'edge-or-unknown';
  scope: 'better-auth' | 'application' | 'unclassified';
  retryAfterSeconds: number | null;
};

const LIMIT = 20;
const events: RateLimitEvent[] = [];
let total = 0;
let installed = false;

function safeRoute(path: string): string {
  const parts = path.split('/').slice(0, 6);
  return parts.map((part, index) => {
    if (!index || !part) return part;
    if (index <= 2 && (part === 'api' || part === 'v1' || part === 'auth')) return part;
    // Even alphabetic resource IDs can be secret. Always redact values after
    // collection segments, regardless of whether they look like a slug.
    if (index >= 3 && new Set(['accounts','conversations','communities','channels',
      'messages','profiles','users','friends','notifications']).has(parts[index-1])) return ':id';
    // Never capture arbitrary resource keys, long paths or private mailbox IDs.
    return /^[a-z][a-z0-9-]{1,28}$/.test(part) && !/\d{4,}/.test(part)
      ? part : ':id';
  }).join('/') || '/';
}

export function summarize429(response: Response, url: URL, now = new Date()): RateLimitEvent {
  const upstream = response.headers.get('x-uorqui-upstream-429') === '1';
  const reportedScope = response.headers.get('x-uorqui-rate-limit-scope');
  const retry = response.headers.get('retry-after');
  return {
    time: now.toISOString(),
    route: safeRoute(url.pathname),
    origin: upstream ? 'render-upstream' : 'edge-or-unknown',
    scope: reportedScope === 'better-auth' || reportedScope === 'application'
      ? reportedScope : 'unclassified',
    retryAfterSeconds: retry && /^\d{1,5}$/.test(retry.trim())
      ? Number(retry.trim()) : null,
  };
}

export function getRateLimitDiagnostics(): { count: number; recent: RateLimitEvent[] } {
  return {count: total, recent: events.slice()};
}

export function clearRateLimitDiagnostics(): void {
  total = 0;
  events.length = 0;
}

export function installRateLimitDiagnostics(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const promise = originalFetch(input, init);
    const rawUrl = typeof input === 'string' || input instanceof URL
      ? input.toString() : input.url;
    let url: URL;
    try { url = new URL(rawUrl, window.location.href); }
    catch { return promise; }
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/'))
      return promise;
    return promise.then(response => {
      if (response.status === 429) {
        events.push(summarize429(response, url));
        ++total;
        if (events.length > LIMIT) events.shift();
      }
      return response;
    });
  }) as typeof globalThis.fetch;
  window.__uorquiRateLimitDiagnostics = getRateLimitDiagnostics;
}

declare global {
  interface Window {
    /** Includes only aggregate response metadata and sanitized route names. */
    __uorquiRateLimitDiagnostics?: typeof getRateLimitDiagnostics;
  }
}
