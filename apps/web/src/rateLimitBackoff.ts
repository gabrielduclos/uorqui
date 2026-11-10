/** Backoff for HTTP 429 responses from the upstream API/provider. */
export function rateLimitRetryDelay(header: string | null, now = Date.now()): number {
  const raw = header?.trim() ?? '';
  const seconds = /^\d{1,8}$/.test(raw) ? Number(raw) * 1000 : NaN;
  const dateDelay = raw && !Number.isFinite(seconds) ? Date.parse(raw) - now : NaN;
  const proposed = Number.isFinite(seconds) ? seconds : dateDelay;
  return Number.isFinite(proposed)
    ? Math.min(180_000, Math.max(30_000, proposed))
    : 30_000;
}
