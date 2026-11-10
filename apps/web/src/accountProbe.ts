/**
 * Account bootstrap is a short-lived in-memory *transport* cache, not an
 * authorization decision. Every protected API route still validates its
 * own server-side session.
 *
 * React StrictMode and the login panel can ask for /api/v1/me at nearly the
 * same time; coalesce those reads without persisting user data to storage.
 */
type ProbeOptions = { fresh?: boolean; signal?: AbortSignal };

export type AccountProbeDiagnostics = {
  networkLastMinute: number;
  networkTotal: number;
  coalescedTotal: number;
  cacheHitsTotal: number;
  rateLimitedTotal: number;
  lastStatus: number | null;
};

let cached: { response: Response; until: number } | null = null;
let inFlight: Promise<Response> | null = null;
let epoch = 0;
const networkTimes: number[] = [];
let networkTotal = 0;
let coalescedTotal = 0;
let cacheHitsTotal = 0;
let rateLimitedTotal = 0;
let lastStatus: number | null = null;

function pruneNetworkTimes(now: number): void {
  while (networkTimes.length && networkTimes[0] < now - 60_000)
    networkTimes.shift();
}

export function getAccountProbeDiagnostics(now = Date.now()): AccountProbeDiagnostics {
  pruneNetworkTimes(now);
  return {
    networkLastMinute: networkTimes.length,
    networkTotal, coalescedTotal, cacheHitsTotal, rateLimitedTotal, lastStatus,
  };
}

/** Clear cached identity after login, logout or account deletion. */
export function invalidateAccountProbe(): void {
  ++epoch;
  cached = null;
  // An older request can still settle, but it must not overwrite new identity.
  inFlight = null;
}

function waitForCaller(pending: Promise<Response>, signal?: AbortSignal): Promise<Response> {
  if (!signal) return pending.then(response => response.clone());
  if (signal.aborted)
    return Promise.reject(new DOMException('Request cancelled', 'AbortError'));
  return new Promise<Response>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Request cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    void pending.then(response => {
      signal.removeEventListener('abort', abort);
      if (!signal.aborted) resolve(response.clone());
    }, error => {
      signal.removeEventListener('abort', abort);
      if (!signal.aborted) reject(error);
    });
  });
}

/**
 * A successful profile is reused for at most 8 seconds; 401 for 2 seconds.
 * 429, 5xx and network failures are never cached.
 * `fresh` invalidates old reads and prevents a pre-login 401 race.
 */
export function getAccountProbe(options: ProbeOptions = {}): Promise<Response> {
  if (options.fresh) invalidateAccountProbe();
  if (options.signal?.aborted)
    return Promise.reject(new DOMException('Request cancelled', 'AbortError'));

  const now = Date.now();
  if (cached && cached.until > now) {
    ++cacheHitsTotal;
    return Promise.resolve(cached.response.clone());
  }
  if (inFlight) {
    ++coalescedTotal;
    return waitForCaller(inFlight, options.signal);
  }

  const startedEpoch = epoch;
  ++networkTotal;
  networkTimes.push(now);
  pruneNetworkTimes(now);
  const pending = fetch('/api/v1/me', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  }).then(response => {
    lastStatus = response.status;
    if (response.status === 429) ++rateLimitedTotal;
    if (startedEpoch === epoch) {
      const lifespan = response.ok ? 8_000 : response.status === 401 ? 2_000 : 0;
      cached = lifespan ? { response: response.clone(), until: Date.now() + lifespan } : null;
    }
    return response;
  }).finally(() => {
    if (inFlight === pending) inFlight = null;
  });
  inFlight = pending;
  return waitForCaller(pending, options.signal);
}

declare global {
  interface Window {
    /** Only aggregate counts; never includes cookies, emails or IP addresses. */
    __uorquiAuthDiagnostics?: () => AccountProbeDiagnostics;
  }
}
if (typeof window !== 'undefined') {
  window.__uorquiAuthDiagnostics = getAccountProbeDiagnostics;
}
